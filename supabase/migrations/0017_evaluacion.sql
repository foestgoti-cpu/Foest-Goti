-- =============================================================================
-- FOEST - Migracion 0017_evaluacion (docs/modules/evaluacion.md, DECISIONES secciones 4, 9, 10, 18)
--
-- Supone aplicadas 0001..0013 (y, para el chequeo documental real, 0014_documentos:
-- tipo_documento, requisito_documento, documento). Idempotente.
--
-- Contenido:
--   1. Tablas revision, revision_documento (por TIPO de documento) y revision_beneficio.
--   2. Inmutabilidad: una revision decidida (decidida_en no nulo) y sus hijas no se modifican.
--   3. RLS: el funcionario lee SUS revisiones, el administrador todas, el beneficiario solo las
--      decididas de sus postulaciones (sin funcionario_id: privilegios por columna); escrituras
--      solo service_role.
--   4. Funciones de apoyo (security definer, solo service_role):
--        fn_evaluacion_requisitos     requisitos y soportes de la postulacion (chequeo por tipo)
--        fn_guardar_chequeo           guarda el borrador de chequeo del ciclo (idempotente)
--        fn_registrar_dictamen        revision + detalles + cierre, en UNA transaccion
--        fn_reabrir_dictamen          compensacion si la transicion de estado falla
--   5. Recreacion (idempotente) de mv_postulacion_envio / mv_postulacion_beneficio con las
--      columnas reales de revision / revision_beneficio (grano y indices unicos de 0008).
--
-- El cambio de estado de la postulacion NO se hace aqui: lo ejecuta la API con
-- postulacionService.transicionar() -> fn_transicionar_postulacion (modulo postulaciones).
--
-- NOTA JURIDICA (no implementado): campo `recurso_estado` (o tabla `recurso`) para el recurso de
-- reposicion y la firma del acto administrativo en RECHAZADA / aprobacion parcial. Ver el recuadro
-- "Punto abierto para el area juridica" de docs/modules/evaluacion.md. Las revisiones inmutables
-- y revision.funcionario_id (interno) permiten atribuir el acto sin cambiar este modelo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------
create table if not exists public.revision (
  id                        uuid primary key default gen_random_uuid(),
  postulacion_id            uuid not null references public.postulacion(id) on delete cascade,
  postulacion_envio_id      uuid references public.postulacion_envio(id),
  ciclo                     integer not null check (ciclo >= 1),
  -- INTERNO: nunca se expone al beneficiario (anonimato del evaluador).
  funcionario_id            uuid not null references public.usuario(id),
  -- Asignacion ACTIVA al iniciar la revision (modulo asignaciones; sin FK para no acoplar migraciones).
  asignacion_id             uuid,
  -- NULL mientras la revision es un borrador de chequeo.
  resultado                 text check (resultado is null or resultado in ('APROBAR', 'RECHAZAR', 'CORRECCION')),
  observaciones             text,
  campos_observados         jsonb not null default '[]'::jsonb,
  documentos_observados     jsonb not null default '[]'::jsonb,
  fecha_limite_subsanacion  timestamptz,
  version_postulacion       integer,
  iniciada_en               timestamptz not null default now(),
  decidida_en               timestamptz,
  constraint ck_revision_decidida_resultado check ((decidida_en is null) = (resultado is null))
);
comment on table public.revision is 'Revision de un ciclo de la postulacion. Borrador (decidida_en nulo) acumula el chequeo; decidida es inmutable.';
comment on column public.revision.funcionario_id is 'Uso interno (auditoria, historial del administrador, metricas). Nunca se expone al beneficiario.';

-- Un solo dictamen por ciclo y un solo borrador por (ciclo, funcionario).
create unique index if not exists ux_revision_dictamen_ciclo
  on public.revision (postulacion_id, ciclo) where decidida_en is not null;
create unique index if not exists ux_revision_borrador_funcionario
  on public.revision (postulacion_id, ciclo, funcionario_id) where decidida_en is null;
create index if not exists ix_revision_postulacion on public.revision (postulacion_id, ciclo);
create index if not exists ix_revision_funcionario on public.revision (funcionario_id, decidida_en);

create table if not exists public.revision_documento (
  id                      uuid primary key default gen_random_uuid(),
  revision_id             uuid not null references public.revision(id) on delete cascade,
  -- Chequeo por TIPO de documento (tipo_documento.id; FK condicional mas abajo).
  tipo_id                 uuid not null,
  -- Nulos si el soporte nunca se cargo (permite NO_PRESENTA sobre un soporte ausente).
  documento_id            uuid,
  documento_version       integer,
  resultado               text not null check (resultado in ('PRESENTA', 'NO_PRESENTA', 'NO_APLICA')),
  observacion_especifica  text,
  verificado_en           timestamptz not null default now(),
  constraint uq_revision_documento_tipo unique (revision_id, tipo_id),
  constraint ck_revision_documento_version check ((documento_id is null) = (documento_version is null))
);
create index if not exists ix_revision_documento_revision on public.revision_documento (revision_id);

create table if not exists public.revision_beneficio (
  id                uuid primary key default gen_random_uuid(),
  revision_id       uuid not null references public.revision(id) on delete cascade,
  beneficio_codigo  text not null references public.beneficio(codigo),
  decision          text not null check (decision in ('APROBADO', 'RECHAZADO')),
  motivo            text,
  monto_aprobado    numeric(14, 2),
  constraint uq_revision_beneficio unique (revision_id, beneficio_codigo),
  constraint ck_revision_beneficio_monto check (
    (decision = 'APROBADO' and monto_aprobado is not null and monto_aprobado > 0)
    or (decision = 'RECHAZADO' and monto_aprobado is null)
  )
);
create index if not exists ix_revision_beneficio_revision on public.revision_beneficio (revision_id);

-- FKs hacia el modulo documentos (0014): solo si esas tablas ya existen. Si 0017 se aplica antes de
-- 0014, volver a ejecutar este bloque (es idempotente) una vez aplicada 0014.
do $$
begin
  if to_regclass('public.tipo_documento') is not null
     and not exists (select 1 from pg_constraint where conname = 'fk_revision_documento_tipo') then
    alter table public.revision_documento
      add constraint fk_revision_documento_tipo foreign key (tipo_id) references public.tipo_documento(id);
  end if;
  if to_regclass('public.documento') is not null
     and not exists (select 1 from pg_constraint where conname = 'fk_revision_documento_documento') then
    alter table public.revision_documento
      add constraint fk_revision_documento_documento foreign key (documento_id) references public.documento(id);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Inmutabilidad de la revision decidida y de sus hijas
--    La compensacion fn_reabrir_dictamen activa la variable local foest.reabrir_dictamen.
-- -----------------------------------------------------------------------------
create or replace function public.fn_revision_inmutable()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('foest.reabrir_dictamen', true), '') <> 'on' and old.decidida_en is not null then
    raise exception 'REVISION_INMUTABLE: la revision % ya fue decidida y no admite cambios', old.id using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revision_inmutable on public.revision;
create trigger trg_revision_inmutable before update or delete on public.revision
  for each row execute function public.fn_revision_inmutable();

create or replace function public.fn_revision_hija_inmutable()
returns trigger
language plpgsql
as $$
declare
  v_revision_id uuid;
  v_decidida    timestamptz;
begin
  if tg_op = 'DELETE' then
    v_revision_id := old.revision_id;
  else
    v_revision_id := new.revision_id;
  end if;
  if coalesce(current_setting('foest.reabrir_dictamen', true), '') <> 'on' then
    select r.decidida_en into v_decidida from public.revision r where r.id = v_revision_id;
    if v_decidida is not null then
      raise exception 'REVISION_INMUTABLE: la revision % ya fue decidida; su detalle no admite cambios', v_revision_id using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revision_documento_inmutable on public.revision_documento;
create trigger trg_revision_documento_inmutable before insert or update or delete on public.revision_documento
  for each row execute function public.fn_revision_hija_inmutable();

drop trigger if exists trg_revision_beneficio_inmutable on public.revision_beneficio;
create trigger trg_revision_beneficio_inmutable before insert or update or delete on public.revision_beneficio
  for each row execute function public.fn_revision_hija_inmutable();

-- -----------------------------------------------------------------------------
-- 3. RLS: funcionario lee sus revisiones, administrador todas, beneficiario las decididas propias.
--    Escrituras solo service_role (la API). funcionario_id / asignacion_id no se otorgan a `authenticated`.
-- -----------------------------------------------------------------------------
create or replace function public.fn_revision_visible(p_revision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.revision r
    where r.id = p_revision_id
      and (
        public.es_administrador()
        or (public.es_funcionario() and r.funcionario_id = auth.uid())
        or (
          public.es_beneficiario()
          and r.decidida_en is not null
          and exists (
            select 1 from public.postulacion p
            where p.id = r.postulacion_id and public.es_mi_beneficiario(p.beneficiario_id)
          )
        )
      )
  );
$$;
revoke all on function public.fn_revision_visible(uuid) from public, anon;
grant execute on function public.fn_revision_visible(uuid) to authenticated, service_role;

alter table public.revision enable row level security;
alter table public.revision_documento enable row level security;
alter table public.revision_beneficio enable row level security;

drop policy if exists revision_select on public.revision;
create policy revision_select on public.revision for select to authenticated
  using (public.fn_revision_visible(id));

drop policy if exists revision_documento_select on public.revision_documento;
create policy revision_documento_select on public.revision_documento for select to authenticated
  using (public.fn_revision_visible(revision_id));

drop policy if exists revision_beneficio_select on public.revision_beneficio;
create policy revision_beneficio_select on public.revision_beneficio for select to authenticated
  using (public.fn_revision_visible(revision_id));

revoke all on public.revision from anon, authenticated;
revoke all on public.revision_documento from anon, authenticated;
revoke all on public.revision_beneficio from anon, authenticated;
-- Lectura por columnas: sin funcionario_id ni asignacion_id (anonimato del evaluador).
grant select (id, postulacion_id, postulacion_envio_id, ciclo, resultado, observaciones, campos_observados,
              documentos_observados, fecha_limite_subsanacion, version_postulacion, iniciada_en, decidida_en)
  on public.revision to authenticated;
grant select on public.revision_documento to authenticated;
grant select on public.revision_beneficio to authenticated;

-- -----------------------------------------------------------------------------
-- 4a. Requisitos y soportes de una postulacion (para el chequeo por tipo y la validacion de APROBAR)
--     PROVISIONAL(documentos): si tipo_documento / requisito_documento / documento no existen o su
--     esquema difiere, devuelve disponible = false (el expediente sale sin documentos).
-- -----------------------------------------------------------------------------
create or replace function public.fn_evaluacion_requisitos(p_postulacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_post        public.postulacion%rowtype;
  v_requisitos  jsonb := '[]'::jsonb;
  v_documentos  jsonb := '[]'::jsonb;
begin
  select * into v_post from public.postulacion where id = p_postulacion_id;
  if not found then
    raise exception 'NO_ENCONTRADO: postulacion % no existe', p_postulacion_id using errcode = 'P0002';
  end if;

  if to_regclass('public.tipo_documento') is null or to_regclass('public.requisito_documento') is null then
    return jsonb_build_object('disponible', false, 'requisitos', v_requisitos, 'documentos', v_documentos);
  end if;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'tipo_id', rd.tipo_id,
             'tipo_codigo', td.codigo,
             'tipo_nombre', td.nombre,
             'beneficio_codigo', rd.beneficio_codigo,
             'obligatorio', rd.obligatorio
           ) order by td.codigo, rd.beneficio_codigo), '[]'::jsonb)
      into v_requisitos
      from public.requisito_documento rd
      join public.tipo_documento td on td.id = rd.tipo_id
     where rd.beneficio_codigo in (select pb.beneficio_codigo from public.postulacion_beneficio pb where pb.postulacion_id = p_postulacion_id)
       and rd.tipo_tramite::text = v_post.tipo_solicitud::text;

    if to_regclass('public.documento') is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'documento_id', d.id,
               'tipo_id', d.tipo_id,
               'tipo_codigo', td.codigo,
               'version', d.version_actual,
               'estado_carga', d.estado_carga::text
             ) order by td.codigo), '[]'::jsonb)
        into v_documentos
        from public.documento d
        join public.tipo_documento td on td.id = d.tipo_id
       where d.postulacion_id = p_postulacion_id
         and coalesce(d.eliminado, false) = false;
    end if;
  exception when others then
    return jsonb_build_object('disponible', false, 'requisitos', '[]'::jsonb, 'documentos', '[]'::jsonb, 'error', sqlerrm);
  end;

  return jsonb_build_object('disponible', true, 'requisitos', v_requisitos, 'documentos', v_documentos);
end;
$$;
revoke all on function public.fn_evaluacion_requisitos(uuid) from public, anon, authenticated;
grant execute on function public.fn_evaluacion_requisitos(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 4b. Guardar el borrador de chequeo del ciclo (no cambia estado ni incrementa postulacion.version)
--     p_items: [{ tipo_id, resultado, observacion, documento_id, documento_version }]
-- -----------------------------------------------------------------------------
create or replace function public.fn_guardar_chequeo(
  p_postulacion_id uuid,
  p_funcionario_id uuid,
  p_version        integer,
  p_items          jsonb,
  p_asignacion_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post        public.postulacion%rowtype;
  v_revision_id uuid;
  v_envio_id    uuid;
begin
  select * into v_post from public.postulacion where id = p_postulacion_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO: postulacion % no existe', p_postulacion_id using errcode = 'P0002';
  end if;
  if v_post.estado in ('APROBADA', 'RECHAZADA', 'DESISTIDA') then
    raise exception 'TRANSICION_INVALIDA: la postulacion esta en estado terminal %', v_post.estado using errcode = 'P0001';
  end if;
  if v_post.estado <> 'EN_EVALUACION' then
    raise exception 'TRANSICION_INVALIDA: el chequeo solo se guarda en EN_EVALUACION (estado actual %)', v_post.estado using errcode = 'P0001';
  end if;
  if v_post.version <> p_version then
    raise exception 'VERSION_CONFLICTO: version actual % distinta de la enviada %', v_post.version, p_version using errcode = 'P0001';
  end if;

  select r.id into v_revision_id
    from public.revision r
   where r.postulacion_id = p_postulacion_id and r.ciclo = v_post.ciclo
     and r.funcionario_id = p_funcionario_id and r.decidida_en is null;

  if v_revision_id is null then
    select pe.id into v_envio_id from public.postulacion_envio pe
     where pe.postulacion_id = p_postulacion_id and pe.ciclo = v_post.ciclo;
    insert into public.revision (postulacion_id, postulacion_envio_id, ciclo, funcionario_id, asignacion_id)
    values (p_postulacion_id, v_envio_id, greatest(v_post.ciclo, 1), p_funcionario_id, p_asignacion_id)
    returning id into v_revision_id;
  end if;

  insert into public.revision_documento (revision_id, tipo_id, documento_id, documento_version, resultado, observacion_especifica, verificado_en)
  select v_revision_id, x.tipo_id, x.documento_id, x.documento_version, x.resultado, nullif(btrim(x.observacion), ''), now()
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
         as x(tipo_id uuid, resultado text, observacion text, documento_id uuid, documento_version integer)
  on conflict (revision_id, tipo_id) do update
     set resultado = excluded.resultado,
         observacion_especifica = excluded.observacion_especifica,
         documento_id = excluded.documento_id,
         documento_version = excluded.documento_version,
         verificado_en = now();

  return jsonb_build_object('revision_id', v_revision_id, 'ciclo', v_post.ciclo, 'version', v_post.version);
end;
$$;
revoke all on function public.fn_guardar_chequeo(uuid, uuid, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fn_guardar_chequeo(uuid, uuid, integer, jsonb, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 4c. Registrar el dictamen: revision + detalle por beneficio + cierre (decidida_en) +
--     observacion publica en postulacion.correccion_vigente, todo en UNA transaccion.
--     El chequeo por tipo ya esta en el borrador (fn_guardar_chequeo).
--     p_beneficios: [{ codigo, decision, motivo, monto_aprobado }] (vacio en CORRECCION)
--     p_correccion_publica: ObservacionPublica del dictamen (sin ningun dato del evaluador)
-- -----------------------------------------------------------------------------
create or replace function public.fn_registrar_dictamen(
  p_postulacion_id       uuid,
  p_funcionario_id       uuid,
  p_version              integer,
  p_resultado            text,
  p_observaciones        text,
  p_campos_observados    jsonb,
  p_documentos_observados jsonb,
  p_fecha_limite         timestamptz,
  p_beneficios           jsonb,
  p_correccion_publica   jsonb,
  p_asignacion_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post          public.postulacion%rowtype;
  v_revision_id   uuid;
  v_envio_id      uuid;
  v_decidida_en   timestamptz := now();
  v_parcial       boolean := false;
  v_aprobados     integer := 0;
  v_rechazados    integer := 0;
  v_usuario_ben   uuid;
  v_beneficios    jsonb := coalesce(p_beneficios, '[]'::jsonb);
begin
  if p_resultado not in ('APROBAR', 'RECHAZAR', 'CORRECCION') then
    raise exception 'DATOS_INVALIDOS: resultado % no valido', p_resultado using errcode = 'P0001';
  end if;

  select * into v_post from public.postulacion where id = p_postulacion_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO: postulacion % no existe', p_postulacion_id using errcode = 'P0002';
  end if;
  if v_post.estado in ('APROBADA', 'RECHAZADA', 'DESISTIDA') then
    raise exception 'TRANSICION_INVALIDA: la postulacion esta en estado terminal %', v_post.estado using errcode = 'P0001';
  end if;
  if v_post.estado <> 'EN_EVALUACION' then
    raise exception 'TRANSICION_INVALIDA: solo se dictamina en EN_EVALUACION (estado actual %)', v_post.estado using errcode = 'P0001';
  end if;
  if v_post.version <> p_version then
    raise exception 'VERSION_CONFLICTO: version actual % distinta de la enviada %', v_post.version, p_version using errcode = 'P0001';
  end if;

  -- Detalle por beneficio (no aplica en CORRECCION)
  if p_resultado = 'CORRECCION' then
    v_beneficios := '[]'::jsonb;
  else
    if exists (
      select 1 from public.postulacion_beneficio pb
       where pb.postulacion_id = p_postulacion_id
         and pb.beneficio_codigo not in (select x.codigo from jsonb_to_recordset(v_beneficios) as x(codigo text))
    ) then
      raise exception 'BENEFICIOS_INCOMPLETOS: cada beneficio solicitado debe tener una decision' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(v_beneficios) as x(codigo text)
       where x.codigo not in (select pb.beneficio_codigo from public.postulacion_beneficio pb where pb.postulacion_id = p_postulacion_id)
    ) then
      raise exception 'BENEFICIO_NO_SOLICITADO: hay beneficios que la postulacion no solicito' using errcode = 'P0001';
    end if;
    select count(*) filter (where x.decision = 'APROBADO'), count(*) filter (where x.decision = 'RECHAZADO')
      into v_aprobados, v_rechazados
      from jsonb_to_recordset(v_beneficios) as x(codigo text, decision text);
    if p_resultado = 'APROBAR' and v_aprobados = 0 then
      raise exception 'DATOS_INVALIDOS: APROBAR exige al menos un beneficio aprobado' using errcode = 'P0001';
    end if;
    if p_resultado = 'RECHAZAR' and v_aprobados > 0 then
      raise exception 'DATOS_INVALIDOS: RECHAZAR exige que todos los beneficios queden rechazados' using errcode = 'P0001';
    end if;
    v_parcial := (p_resultado = 'APROBAR' and v_rechazados > 0);
  end if;

  -- Borrador del ciclo del evaluador (se crea si aun no guardo chequeo)
  select r.id into v_revision_id
    from public.revision r
   where r.postulacion_id = p_postulacion_id and r.ciclo = v_post.ciclo
     and r.funcionario_id = p_funcionario_id and r.decidida_en is null;
  if v_revision_id is null then
    select pe.id into v_envio_id from public.postulacion_envio pe
     where pe.postulacion_id = p_postulacion_id and pe.ciclo = v_post.ciclo;
    insert into public.revision (postulacion_id, postulacion_envio_id, ciclo, funcionario_id, asignacion_id)
    values (p_postulacion_id, v_envio_id, greatest(v_post.ciclo, 1), p_funcionario_id, p_asignacion_id)
    returning id into v_revision_id;
  end if;

  delete from public.revision_beneficio where revision_id = v_revision_id;
  insert into public.revision_beneficio (revision_id, beneficio_codigo, decision, motivo, monto_aprobado)
  select v_revision_id, x.codigo, x.decision,
         nullif(btrim(x.motivo), ''),
         case when x.decision = 'APROBADO' then x.monto_aprobado else null end
    from jsonb_to_recordset(v_beneficios) as x(codigo text, decision text, motivo text, monto_aprobado numeric);

  -- Observacion publica para el beneficiario (APROBADA / RECHAZADA no la tocan en fn_transicionar_postulacion;
  -- EN_CORRECCION la reescribe con el mismo contenido desde el payload).
  update public.postulacion
     set correccion_vigente = coalesce(p_correccion_publica, '{}'::jsonb) || jsonb_build_object('decidida_en', v_decidida_en)
   where id = p_postulacion_id;

  -- Cierre (el trigger de inmutabilidad aplica desde aqui)
  update public.revision
     set resultado = p_resultado,
         observaciones = nullif(btrim(coalesce(p_observaciones, '')), ''),
         campos_observados = coalesce(p_campos_observados, '[]'::jsonb),
         documentos_observados = coalesce(p_documentos_observados, '[]'::jsonb),
         fecha_limite_subsanacion = case when p_resultado = 'CORRECCION' then p_fecha_limite else null end,
         version_postulacion = p_version,
         decidida_en = v_decidida_en
   where id = v_revision_id;

  select b.usuario_id into v_usuario_ben from public.beneficiario b where b.id = v_post.beneficiario_id;

  return jsonb_build_object(
    'revision_id', v_revision_id,
    'postulacion_id', p_postulacion_id,
    'ciclo', v_post.ciclo,
    'decidida_en', v_decidida_en,
    'aprobacion_parcial', v_parcial,
    'convocatoria_id', v_post.convocatoria_id,
    'beneficiario_usuario_id', v_usuario_ben,
    'correccion_previa', v_post.correccion_vigente
  );
end;
$$;
revoke all on function public.fn_registrar_dictamen(uuid, uuid, integer, text, text, jsonb, jsonb, timestamptz, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_registrar_dictamen(uuid, uuid, integer, text, text, jsonb, jsonb, timestamptz, jsonb, jsonb, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 4d. Compensacion: si la transicion de estado falla despues de registrar el dictamen, la revision
--     vuelve a borrador (conserva el chequeo) y se restaura la observacion previa. Solo procede si la
--     postulacion no cambio de version (es decir, la transicion NO ocurrio).
-- -----------------------------------------------------------------------------
create or replace function public.fn_reabrir_dictamen(
  p_revision_id        uuid,
  p_version_registro   integer,
  p_correccion_previa  jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev  public.revision%rowtype;
  v_post public.postulacion%rowtype;
begin
  select * into v_rev from public.revision where id = p_revision_id;
  if not found or v_rev.decidida_en is null then
    return false;
  end if;
  select * into v_post from public.postulacion where id = v_rev.postulacion_id for update;
  if v_post.version <> p_version_registro then
    -- La transicion si ocurrio: el dictamen es firme.
    return false;
  end if;

  perform set_config('foest.reabrir_dictamen', 'on', true);
  delete from public.revision_beneficio where revision_id = p_revision_id;
  update public.revision
     set resultado = null, decidida_en = null, observaciones = null,
         campos_observados = '[]'::jsonb, documentos_observados = '[]'::jsonb,
         fecha_limite_subsanacion = null, version_postulacion = null
   where id = p_revision_id;
  update public.postulacion set correccion_vigente = p_correccion_previa where id = v_rev.postulacion_id;
  perform set_config('foest.reabrir_dictamen', 'off', true);
  return true;
end;
$$;
revoke all on function public.fn_reabrir_dictamen(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_reabrir_dictamen(uuid, integer, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Vistas materializadas de metricas con las columnas reales de revision / revision_beneficio.
--    Mismo grano e indices unicos que 0008 (REFRESH ... CONCURRENTLY). Idempotente: si las vistas
--    ya dependen de revision no se tocan. Columnas usadas: revision.{postulacion_id, ciclo, resultado,
--    decidida_en} y revision_beneficio.{revision_id, beneficio_codigo, decision}.
-- -----------------------------------------------------------------------------
do $$
declare
  v_envio_ok boolean;
  v_benef_ok boolean;
begin
  select exists (
    select 1 from pg_depend d
      join pg_rewrite rw on rw.oid = d.objid
      join pg_class mv on mv.oid = rw.ev_class
      join pg_class src on src.oid = d.refobjid
     where mv.relname = 'mv_postulacion_envio' and src.relname = 'revision'
  ) into v_envio_ok;
  select exists (
    select 1 from pg_depend d
      join pg_rewrite rw on rw.oid = d.objid
      join pg_class mv on mv.oid = rw.ev_class
      join pg_class src on src.oid = d.refobjid
     where mv.relname = 'mv_postulacion_beneficio' and src.relname = 'revision_beneficio'
  ) into v_benef_ok;

  if v_envio_ok and v_benef_ok then
    raise notice '0017: las vistas materializadas ya incluyen revision / revision_beneficio; no se recrean.';
    return;
  end if;

  begin
    execute 'drop materialized view if exists public.mv_postulacion_envio cascade';
    execute $mv$
      create materialized view public.mv_postulacion_envio as
      select
        pe.postulacion_id,
        pe.ciclo,
        p.convocatoria_id,
        p.tipo_solicitud::text                                       as tipo_solicitud,
        p.estado::text                                               as estado_actual,
        (pe.ciclo = p.ciclo)                                         as es_ciclo_actual,
        p.aprobacion_parcial,
        r.resultado::text                                            as resultado_ciclo,
        pe.enviado_en,
        (pe.enviado_en at time zone 'America/Bogota')::date          as dia_envio,
        r.decidida_en,
        (case when r.decidida_en is not null
              then extract(epoch from (r.decidida_en - pe.enviado_en)) / 3600.0
         end)::numeric(12,2)                                         as horas_dictamen
      from public.postulacion_envio pe
      join public.postulacion p on p.id = pe.postulacion_id
      left join public.revision r
             on r.postulacion_id = pe.postulacion_id
            and r.ciclo          = pe.ciclo
            and r.decidida_en    is not null
      where p.estado <> 'BORRADOR'
      with data
    $mv$;

    execute 'drop materialized view if exists public.mv_postulacion_beneficio cascade';
    execute $mv$
      create materialized view public.mv_postulacion_beneficio as
      select
        pb.postulacion_id,
        pb.beneficio_codigo,
        p.convocatoria_id,
        p.tipo_solicitud::text                                       as tipo_solicitud,
        p.estado::text                                               as estado_actual,
        coalesce(rb.decision::text, 'SIN_DECISION')                  as decision_beneficio,
        (pe.enviado_en at time zone 'America/Bogota')::date          as dia_envio
      from public.postulacion_beneficio pb
      join public.postulacion p        on p.id = pb.postulacion_id
      join public.postulacion_envio pe on pe.postulacion_id = p.id and pe.ciclo = p.ciclo
      left join public.revision r
             on r.postulacion_id = p.id and r.ciclo = p.ciclo and r.decidida_en is not null
      left join public.revision_beneficio rb
             on rb.revision_id = r.id and rb.beneficio_codigo = pb.beneficio_codigo
      where p.estado <> 'BORRADOR'
      with data
    $mv$;
    raise notice '0017: vistas materializadas recreadas con revision / revision_beneficio.';
  exception when others then
    raise notice '0017: no fue posible recrear las vistas (%); se aplica la definicion base si faltan.', sqlerrm;
  end;
end $$;

-- Garantia: si alguna vista no existe, se crea con la definicion base de 0001 / 0008.
do $$ begin
  if not exists (select 1 from pg_matviews where schemaname = 'public' and matviewname = 'mv_postulacion_envio') then
    create materialized view public.mv_postulacion_envio as
    select
      pe.postulacion_id, pe.ciclo, p.convocatoria_id,
      p.tipo_solicitud::text as tipo_solicitud, p.estado::text as estado_actual,
      (pe.ciclo = p.ciclo) as es_ciclo_actual, p.aprobacion_parcial,
      null::text as resultado_ciclo, pe.enviado_en,
      (pe.enviado_en at time zone 'America/Bogota')::date as dia_envio,
      null::timestamptz as decidida_en, null::numeric(12,2) as horas_dictamen
    from public.postulacion_envio pe
    join public.postulacion p on p.id = pe.postulacion_id
    where p.estado <> 'BORRADOR'
    with data;
  end if;
  if not exists (select 1 from pg_matviews where schemaname = 'public' and matviewname = 'mv_postulacion_beneficio') then
    create materialized view public.mv_postulacion_beneficio as
    select
      pb.postulacion_id, pb.beneficio_codigo, p.convocatoria_id,
      p.tipo_solicitud::text as tipo_solicitud, p.estado::text as estado_actual,
      'SIN_DECISION'::text as decision_beneficio,
      (pe.enviado_en at time zone 'America/Bogota')::date as dia_envio
    from public.postulacion_beneficio pb
    join public.postulacion p        on p.id = pb.postulacion_id
    join public.postulacion_envio pe on pe.postulacion_id = p.id and pe.ciclo = p.ciclo
    where p.estado <> 'BORRADOR'
    with data;
  end if;
end $$;

create unique index if not exists ux_mv_postulacion_envio on public.mv_postulacion_envio (postulacion_id, ciclo);
create index if not exists ix_mv_envio_convocatoria on public.mv_postulacion_envio (convocatoria_id, es_ciclo_actual, estado_actual);
create index if not exists ix_mv_envio_dia on public.mv_postulacion_envio (convocatoria_id, dia_envio);
create index if not exists ix_mv_envio_decidida on public.mv_postulacion_envio (convocatoria_id, decidida_en) where decidida_en is not null;

create unique index if not exists ux_mv_postulacion_beneficio on public.mv_postulacion_beneficio (postulacion_id, beneficio_codigo);
create index if not exists ix_mv_beneficio_convocatoria on public.mv_postulacion_beneficio (convocatoria_id, beneficio_codigo);

revoke all on public.mv_postulacion_envio from public, anon, authenticated;
revoke all on public.mv_postulacion_beneficio from public, anon, authenticated;
