-- =============================================================================
-- FOEST - Migracion 0018_seguimiento_beneficios (docs/modules/seguimiento_beneficios.md, DECISIONES 12, 14, 18)
--
-- Supone aplicadas 0001..0013 (y 0006: datos_pago_st). Idempotente.
--
-- Contenido:
--   1. Tablas: cuenta_pago (copia ENMASCARADA de datos_pago_st; el cifrado vive en datos_pago_st),
--      otorgamiento, otorgamiento_evento (append-only), desembolso, carga_pagos.
--      Las columnas respetan a los lectores existentes (beneficiario_dashboard, admin_dashboard, 0009).
--   2. Triggers: maquina de estados e inmutabilidad de REVOCADO / CUMPLIDO, desembolsos terminales,
--      suma de desembolsos <= monto_aprobado, evento append-only, beneficiario_id derivado.
--   3. RLS: el beneficiario lee solo lo propio (privilegios por columna); el funcionario no accede;
--      el administrador lee todo; escrituras solo service_role.
--   4. Funciones security definer (solo service_role) para atomicidad:
--        fn_crear_otorgamiento, fn_cambiar_estado_otorgamiento, fn_programar_desembolso,
--        fn_pagar_desembolso, fn_anular_desembolso, fn_aplicar_carga_pagos,
--        fn_cupos_ocupacion, fn_otorgamientos_por_estado.
--   5. Claves de configuracion: ALERTA_PRESUPUESTO_PORCENTAJE y ELEGIBILIDAD_* (a confirmar con el Acuerdo 023).
--
-- Los errores de negocio se señalan con `raise exception '<CODIGO>'` (SQLSTATE P0001); la API los traduce.
-- La plataforma NO diligencia el pagare: revocar solo registra la perdida del apoyo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------
-- Cuenta de pago ENMASCARADA del subsidio de transporte (el numero cifrado solo existe en datos_pago_st).
create table if not exists public.cuenta_pago (
  id               uuid primary key default gen_random_uuid(),
  beneficiario_id  uuid not null references public.beneficiario(id) on delete cascade,
  postulacion_id   uuid not null unique references public.postulacion(id) on delete cascade,
  tipo             text not null,
  entidad          text,
  ultimos4         text check (ultimos4 is null or ultimos4 ~ '^\d{4}$'),
  creado_en        timestamptz not null default now()
);
comment on table public.cuenta_pago is 'Datos NO sensibles de la cuenta de pago (tipo, entidad, ultimos4). El numero cifrado vive en datos_pago_st.';

create table if not exists public.otorgamiento (
  id                  uuid primary key default gen_random_uuid(),
  postulacion_id      uuid not null references public.postulacion(id),
  convocatoria_id     uuid not null references public.convocatoria(id),
  beneficiario_id     uuid not null references public.beneficiario(id),
  beneficio_codigo    text not null references public.beneficio(codigo),
  monto_aprobado      numeric(16,2) not null default 0 check (monto_aprobado >= 0),
  estado              text not null default 'ACTIVO' check (estado in ('ACTIVO', 'SUSPENDIDO', 'REVOCADO', 'CUMPLIDO')),
  cuenta_pago_id      uuid references public.cuenta_pago(id),
  revision_id         uuid,
  excede_cupo         boolean not null default false,
  excede_presupuesto  boolean not null default false,
  version             integer not null default 1,
  otorgado_en         timestamptz not null default now(),
  estado_cambiado_en  timestamptz,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  constraint ux_otorgamiento_postulacion_beneficio unique (postulacion_id, beneficio_codigo)
);
comment on table public.otorgamiento is 'Un otorgamiento por postulacion y beneficio aprobado (seguimiento_beneficios). Estados terminales: REVOCADO, CUMPLIDO.';
create index if not exists ix_otorgamiento_beneficiario on public.otorgamiento (beneficiario_id);
create index if not exists ix_otorgamiento_convocatoria_beneficio on public.otorgamiento (convocatoria_id, beneficio_codigo, estado);
create index if not exists ix_otorgamiento_estado on public.otorgamiento (estado);

drop trigger if exists trg_otorgamiento_actualizado_en on public.otorgamiento;
create trigger trg_otorgamiento_actualizado_en before update on public.otorgamiento
  for each row execute function public.fn_set_actualizado_en();

create table if not exists public.otorgamiento_evento (
  id               uuid primary key default gen_random_uuid(),
  otorgamiento_id  uuid not null references public.otorgamiento(id) on delete cascade,
  tipo             text not null check (tipo in (
                     'CREADO', 'SUSPENDIDO', 'REACTIVADO', 'REVOCADO', 'CUMPLIDO', 'CUPO_EXCEDIDO', 'PRESUPUESTO_EXCEDIDO',
                     'DESEMBOLSO_PROGRAMADO', 'DESEMBOLSO_PAGADO', 'DESEMBOLSO_ANULADO')),
  estado_anterior  text check (estado_anterior is null or estado_anterior in ('ACTIVO', 'SUSPENDIDO', 'REVOCADO', 'CUMPLIDO')),
  estado_nuevo     text check (estado_nuevo is null or estado_nuevo in ('ACTIVO', 'SUSPENDIDO', 'REVOCADO', 'CUMPLIDO')),
  motivo           text,
  actor_id         uuid references public.usuario(id),
  metadatos        jsonb not null default '{}'::jsonb,
  ocurrido_en      timestamptz not null default now()
);
comment on table public.otorgamiento_evento is 'Historial append-only del otorgamiento. actor_id y metadatos son de uso interno.';
create index if not exists ix_otorgamiento_evento_otorgamiento on public.otorgamiento_evento (otorgamiento_id, ocurrido_en);

create table if not exists public.carga_pagos (
  id               uuid primary key default gen_random_uuid(),
  admin_id         uuid references public.usuario(id),
  archivo_nombre   text,
  archivo_sha256   text not null,
  filas_total      integer not null default 0,
  filas_ok         integer not null default 0,
  filas_error      integer not null default 0,
  resultado        jsonb not null default '[]'::jsonb,
  cargada_en       timestamptz not null default now(),
  constraint ux_carga_pagos_sha unique (archivo_sha256)
);
comment on table public.carga_pagos is 'Cargas masivas de pagos APLICADAS (todo o nada). El mismo archivo (SHA-256) no se aplica dos veces.';

create table if not exists public.desembolso (
  id                   uuid primary key default gen_random_uuid(),
  otorgamiento_id      uuid not null references public.otorgamiento(id),
  estado               text not null default 'PROGRAMADO' check (estado in ('PROGRAMADO', 'PAGADO', 'ANULADO')),
  monto                numeric(16,2) not null check (monto > 0),
  concepto             text,
  fecha_programada     date,
  fecha_pago           date,
  referencia           text,
  motivo_anulacion     text,
  confirmar_excedente  boolean not null default false,
  motivo_excedente     text,
  registrado_por       uuid references public.usuario(id),
  carga_id             uuid references public.carga_pagos(id),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  constraint ck_desembolso_pagado check (estado <> 'PAGADO' or (referencia is not null and fecha_pago is not null)),
  constraint ck_desembolso_anulado check (estado <> 'ANULADO' or motivo_anulacion is not null)
);
comment on table public.desembolso is 'Desembolso de un otorgamiento. Terminales: PAGADO y ANULADO. referencia unica entre los PAGADO.';
create index if not exists ix_desembolso_otorgamiento on public.desembolso (otorgamiento_id, estado);
create unique index if not exists ux_desembolso_referencia_pagado on public.desembolso (referencia) where estado = 'PAGADO';

drop trigger if exists trg_desembolso_actualizado_en on public.desembolso;
create trigger trg_desembolso_actualizado_en before update on public.desembolso
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- 2. Triggers de integridad
-- -----------------------------------------------------------------------------
-- 2.1 beneficiario_id derivado de la postulacion si el insert no lo trae (compatibilidad con el puerto provisional de evaluacion).
create or replace function public.fn_otorgamiento_defaults()
returns trigger language plpgsql as $$
begin
  if new.beneficiario_id is null then
    select p.beneficiario_id into new.beneficiario_id from public.postulacion p where p.id = new.postulacion_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_otorgamiento_defaults on public.otorgamiento;
create trigger trg_otorgamiento_defaults before insert on public.otorgamiento
  for each row execute function public.fn_otorgamiento_defaults();

-- 2.2 Maquina de estados: REVOCADO y CUMPLIDO son terminales (el .md solo permite reactivar desde SUSPENDIDO).
create or replace function public.fn_otorgamiento_transicion()
returns trigger language plpgsql as $$
begin
  if old.estado in ('REVOCADO', 'CUMPLIDO') then
    if new.estado is distinct from old.estado
       or new.monto_aprobado is distinct from old.monto_aprobado
       or new.beneficiario_id is distinct from old.beneficiario_id
       or new.beneficio_codigo is distinct from old.beneficio_codigo then
      raise exception 'OTORGAMIENTO_ESTADO_INVALIDO' using errcode = 'P0001', detail = 'El otorgamiento esta en un estado terminal (' || old.estado || ')';
    end if;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if not ((old.estado = 'ACTIVO' and new.estado in ('SUSPENDIDO', 'REVOCADO', 'CUMPLIDO'))
         or (old.estado = 'SUSPENDIDO' and new.estado in ('ACTIVO', 'REVOCADO'))) then
      raise exception 'OTORGAMIENTO_ESTADO_INVALIDO' using errcode = 'P0001', detail = 'Transicion no permitida: ' || old.estado || ' -> ' || new.estado;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_otorgamiento_transicion on public.otorgamiento;
create trigger trg_otorgamiento_transicion before update on public.otorgamiento
  for each row execute function public.fn_otorgamiento_transicion();

-- 2.3 Desembolsos terminales inmutables.
create or replace function public.fn_desembolso_inmutable()
returns trigger language plpgsql as $$
begin
  if old.estado in ('PAGADO', 'ANULADO')
     and (to_jsonb(new) - 'actualizado_en') is distinct from (to_jsonb(old) - 'actualizado_en') then
    raise exception 'DESEMBOLSO_ESTADO_INVALIDO' using errcode = 'P0001', detail = 'El desembolso esta en un estado terminal (' || old.estado || ')';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_desembolso_inmutable on public.desembolso;
create trigger trg_desembolso_inmutable before update on public.desembolso
  for each row execute function public.fn_desembolso_inmutable();

-- 2.4 La suma de desembolsos no anulados no supera monto_aprobado.
create or replace function public.fn_desembolso_suma()
returns trigger language plpgsql as $$
declare
  v_aprobado numeric;
  v_otros    numeric;
begin
  if new.estado = 'ANULADO' then
    return new;
  end if;
  select o.monto_aprobado into v_aprobado from public.otorgamiento o where o.id = new.otorgamiento_id;
  select coalesce(sum(d.monto), 0) into v_otros
    from public.desembolso d
   where d.otorgamiento_id = new.otorgamiento_id and d.estado <> 'ANULADO' and d.id <> new.id;
  if v_otros + new.monto > v_aprobado then
    raise exception 'MONTO_EXCEDE_APROBADO' using errcode = 'P0001',
      detail = format('Acumulado %s + %s supera el monto aprobado %s', v_otros, new.monto, v_aprobado);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_desembolso_suma on public.desembolso;
create trigger trg_desembolso_suma before insert or update of monto, estado on public.desembolso
  for each row execute function public.fn_desembolso_suma();

-- 2.5 Eventos append-only.
create or replace function public.fn_otorgamiento_evento_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'otorgamiento_evento es append-only' using errcode = 'P0001';
end;
$$;
drop trigger if exists trg_otorgamiento_evento_inmutable on public.otorgamiento_evento;
create trigger trg_otorgamiento_evento_inmutable before update or delete on public.otorgamiento_evento
  for each row execute function public.fn_otorgamiento_evento_inmutable();

-- -----------------------------------------------------------------------------
-- 3. RLS y privilegios
-- -----------------------------------------------------------------------------
alter table public.cuenta_pago enable row level security;
alter table public.otorgamiento enable row level security;
alter table public.otorgamiento_evento enable row level security;
alter table public.desembolso enable row level security;
alter table public.carga_pagos enable row level security;

drop policy if exists cuenta_pago_select on public.cuenta_pago;
create policy cuenta_pago_select on public.cuenta_pago for select to authenticated
  using (public.es_administrador() or (public.es_beneficiario() and public.es_mi_beneficiario(beneficiario_id)));

drop policy if exists otorgamiento_select on public.otorgamiento;
create policy otorgamiento_select on public.otorgamiento for select to authenticated
  using (public.es_administrador() or (public.es_beneficiario() and public.es_mi_beneficiario(beneficiario_id)));

drop policy if exists otorgamiento_evento_select on public.otorgamiento_evento;
create policy otorgamiento_evento_select on public.otorgamiento_evento for select to authenticated
  using (exists (
    select 1 from public.otorgamiento o
    where o.id = otorgamiento_id
      and (public.es_administrador() or (public.es_beneficiario() and public.es_mi_beneficiario(o.beneficiario_id)))
  ));

drop policy if exists desembolso_select on public.desembolso;
create policy desembolso_select on public.desembolso for select to authenticated
  using (exists (
    select 1 from public.otorgamiento o
    where o.id = otorgamiento_id
      and (public.es_administrador() or (public.es_beneficiario() and public.es_mi_beneficiario(o.beneficiario_id)))
  ));

drop policy if exists carga_pagos_select on public.carga_pagos;
create policy carga_pagos_select on public.carga_pagos for select to authenticated
  using (public.es_administrador());

-- Escrituras: solo service_role (bypass). Lecturas por columna: sin actores ni motivos internos.
revoke all on public.cuenta_pago from anon, authenticated;
revoke all on public.otorgamiento from anon, authenticated;
revoke all on public.otorgamiento_evento from anon, authenticated;
revoke all on public.desembolso from anon, authenticated;
revoke all on public.carga_pagos from anon, authenticated;

grant select (id, beneficiario_id, postulacion_id, tipo, entidad, ultimos4, creado_en) on public.cuenta_pago to authenticated;
grant select (id, postulacion_id, convocatoria_id, beneficiario_id, beneficio_codigo, monto_aprobado, estado, cuenta_pago_id,
              version, otorgado_en, estado_cambiado_en, creado_en, actualizado_en) on public.otorgamiento to authenticated;
grant select (id, otorgamiento_id, tipo, estado_anterior, estado_nuevo, motivo, ocurrido_en) on public.otorgamiento_evento to authenticated;
grant select (id, otorgamiento_id, estado, monto, concepto, fecha_programada, fecha_pago, referencia, creado_en, actualizado_en)
  on public.desembolso to authenticated;
grant select on public.carga_pagos to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Funciones (security definer, solo service_role)
-- -----------------------------------------------------------------------------

-- 4.1 Ocupacion de cupos y presupuesto por (convocatoria, beneficio).
create or replace function public.fn_cupos_ocupacion(p_convocatoria_id uuid default null)
returns table (
  convocatoria_id          uuid,
  beneficio_codigo         text,
  cupos_estimados          integer,
  presupuesto_asignado     numeric,
  cupos_ocupados           integer,
  presupuesto_comprometido numeric,
  presupuesto_pagado       numeric,
  monto_aprobado_total     numeric
)
language sql stable security definer set search_path = public as $$
  select cb.convocatoria_id,
         b.codigo::text,
         cb.cupos_estimados,
         cb.presupuesto_asignado,
         (count(o.id) filter (where o.estado in ('ACTIVO', 'SUSPENDIDO', 'CUMPLIDO')))::integer,
         coalesce(sum(o.monto_aprobado) filter (where o.estado in ('ACTIVO', 'SUSPENDIDO', 'CUMPLIDO')), 0),
         coalesce(sum(pg.pagado), 0),
         coalesce(sum(o.monto_aprobado), 0)
    from public.convocatoria_beneficio cb
    join public.beneficio b on b.id = cb.beneficio_id
    left join public.otorgamiento o on o.convocatoria_id = cb.convocatoria_id and o.beneficio_codigo = b.codigo
    left join lateral (
      select sum(d.monto) as pagado from public.desembolso d where d.otorgamiento_id = o.id and d.estado = 'PAGADO'
    ) pg on true
   where p_convocatoria_id is null or cb.convocatoria_id = p_convocatoria_id
   group by cb.convocatoria_id, b.codigo, cb.cupos_estimados, cb.presupuesto_asignado
$$;
revoke all on function public.fn_cupos_ocupacion(uuid) from public, anon, authenticated;
grant execute on function public.fn_cupos_ocupacion(uuid) to service_role;

create or replace function public.fn_otorgamientos_por_estado(p_convocatoria_id uuid)
returns table (estado text, beneficio_codigo text, total integer, monto numeric)
language sql stable security definer set search_path = public as $$
  select o.estado, o.beneficio_codigo, count(*)::integer, coalesce(sum(o.monto_aprobado), 0)
    from public.otorgamiento o
   where o.convocatoria_id = p_convocatoria_id
   group by o.estado, o.beneficio_codigo
$$;
revoke all on function public.fn_otorgamientos_por_estado(uuid) from public, anon, authenticated;
grant execute on function public.fn_otorgamientos_por_estado(uuid) to service_role;

-- 4.2 Crear otorgamiento (idempotente por postulacion + beneficio). Excederse NO bloquea: solo marca y registra eventos.
create or replace function public.fn_crear_otorgamiento(
  p_postulacion_id   uuid,
  p_beneficio_codigo text,
  p_convocatoria_id  uuid,
  p_monto            numeric,
  p_revision_id      uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_benef     uuid;
  v_id        uuid;
  v_cuenta    uuid := null;
  v_dp        public.datos_pago_st%rowtype;
  v_cb        record;
  v_ocup      integer := 0;
  v_comp      numeric := 0;
  v_exc_cupo  boolean := false;
  v_exc_pres  boolean := false;
begin
  select p.beneficiario_id into v_benef from public.postulacion p where p.id = p_postulacion_id;
  if not found then
    raise exception 'POSTULACION_NO_ENCONTRADA' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_convocatoria_id::text || ':' || p_beneficio_codigo));

  select o.id into v_id from public.otorgamiento o
   where o.postulacion_id = p_postulacion_id and o.beneficio_codigo = p_beneficio_codigo;
  if found then
    return jsonb_build_object('creado', false, 'id', v_id);
  end if;

  if p_beneficio_codigo = 'ST' then
    select * into v_dp from public.datos_pago_st d where d.postulacion_id = p_postulacion_id;
    if found then
      insert into public.cuenta_pago (beneficiario_id, postulacion_id, tipo, entidad, ultimos4)
      values (v_benef, p_postulacion_id, v_dp.tipo, v_dp.entidad, v_dp.ultimos4)
      on conflict (postulacion_id) do update set tipo = excluded.tipo, entidad = excluded.entidad, ultimos4 = excluded.ultimos4
      returning id into v_cuenta;
    end if;
  end if;

  insert into public.otorgamiento (postulacion_id, convocatoria_id, beneficiario_id, beneficio_codigo, monto_aprobado, estado, cuenta_pago_id, revision_id)
  values (p_postulacion_id, p_convocatoria_id, v_benef, p_beneficio_codigo, p_monto, 'ACTIVO', v_cuenta, p_revision_id)
  returning id into v_id;

  select cb.cupos_estimados, cb.presupuesto_asignado into v_cb
    from public.convocatoria_beneficio cb join public.beneficio b on b.id = cb.beneficio_id
   where cb.convocatoria_id = p_convocatoria_id and b.codigo = p_beneficio_codigo;
  if found then
    select count(*), coalesce(sum(o.monto_aprobado), 0) into v_ocup, v_comp
      from public.otorgamiento o
     where o.convocatoria_id = p_convocatoria_id and o.beneficio_codigo = p_beneficio_codigo
       and o.estado in ('ACTIVO', 'SUSPENDIDO', 'CUMPLIDO');
    v_exc_cupo := v_ocup > v_cb.cupos_estimados;
    v_exc_pres := v_comp > v_cb.presupuesto_asignado;
    if v_exc_cupo or v_exc_pres then
      update public.otorgamiento set excede_cupo = v_exc_cupo, excede_presupuesto = v_exc_pres where id = v_id;
    end if;
  end if;

  insert into public.otorgamiento_evento (otorgamiento_id, tipo, estado_anterior, estado_nuevo, motivo, metadatos)
  values (v_id, 'CREADO', null, 'ACTIVO', 'Otorgamiento creado por dictamen aprobatorio', jsonb_build_object('monto_aprobado', p_monto, 'revision_id', p_revision_id));
  if v_exc_cupo then
    insert into public.otorgamiento_evento (otorgamiento_id, tipo, motivo, metadatos)
    values (v_id, 'CUPO_EXCEDIDO', 'Cupos ocupados superan los estimados', jsonb_build_object('ocupados', v_ocup, 'estimados', v_cb.cupos_estimados));
  end if;
  if v_exc_pres then
    insert into public.otorgamiento_evento (otorgamiento_id, tipo, motivo, metadatos)
    values (v_id, 'PRESUPUESTO_EXCEDIDO', 'Presupuesto comprometido supera el asignado', jsonb_build_object('comprometido', v_comp, 'asignado', v_cb.presupuesto_asignado));
  end if;

  return jsonb_build_object(
    'creado', true, 'id', v_id, 'beneficiario_id', v_benef,
    'excede_cupo', v_exc_cupo, 'excede_presupuesto', v_exc_pres,
    'cupos_ocupados', v_ocup, 'presupuesto_comprometido', v_comp
  );
end;
$$;
revoke all on function public.fn_crear_otorgamiento(uuid, text, uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.fn_crear_otorgamiento(uuid, text, uuid, numeric, uuid) to service_role;

-- 4.3 Cambio de estado (SUSPENDER | REACTIVAR | REVOCAR | CUMPLIR) con evento, en una transaccion.
create or replace function public.fn_cambiar_estado_otorgamiento(
  p_id       uuid,
  p_accion   text,
  p_motivo   text,
  p_actor    uuid,
  p_version  integer default null,
  p_forzar   boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o          public.otorgamiento%rowtype;
  v_nuevo    text;
  v_tipo     text;
  v_pend     integer;
  v_anulados integer := 0;
begin
  select * into o from public.otorgamiento where id = p_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0001';
  end if;

  case p_accion
    when 'SUSPENDER' then v_nuevo := 'SUSPENDIDO'; v_tipo := 'SUSPENDIDO';
      if o.estado <> 'ACTIVO' then raise exception 'OTORGAMIENTO_ESTADO_INVALIDO' using errcode = 'P0001', detail = o.estado; end if;
    when 'REACTIVAR' then v_nuevo := 'ACTIVO'; v_tipo := 'REACTIVADO';
      if o.estado <> 'SUSPENDIDO' then raise exception 'OTORGAMIENTO_ESTADO_INVALIDO' using errcode = 'P0001', detail = o.estado; end if;
    when 'REVOCAR' then v_nuevo := 'REVOCADO'; v_tipo := 'REVOCADO';
      if o.estado not in ('ACTIVO', 'SUSPENDIDO') then raise exception 'OTORGAMIENTO_ESTADO_INVALIDO' using errcode = 'P0001', detail = o.estado; end if;
    when 'CUMPLIR' then v_nuevo := 'CUMPLIDO'; v_tipo := 'CUMPLIDO';
      if o.estado <> 'ACTIVO' then raise exception 'OTORGAMIENTO_ESTADO_INVALIDO' using errcode = 'P0001', detail = o.estado; end if;
    else
      raise exception 'ACCION_INVALIDA' using errcode = 'P0001';
  end case;

  if p_version is not null and o.version <> p_version then
    raise exception 'VERSION_CONFLICTO' using errcode = 'P0001', detail = o.version::text;
  end if;

  if p_accion in ('REVOCAR', 'CUMPLIR') then
    select count(*) into v_pend from public.desembolso d where d.otorgamiento_id = p_id and d.estado = 'PROGRAMADO';
    if p_accion = 'CUMPLIR' and v_pend > 0 and not coalesce(p_forzar, false) then
      raise exception 'DESEMBOLSOS_PENDIENTES' using errcode = 'P0001', detail = v_pend::text;
    end if;
    if v_pend > 0 then
      with anulados as (
        update public.desembolso d
           set estado = 'ANULADO',
               motivo_anulacion = case when p_accion = 'REVOCAR' then 'Revocacion del otorgamiento' else 'Cumplimiento forzado del otorgamiento' end
         where d.otorgamiento_id = p_id and d.estado = 'PROGRAMADO'
        returning d.id, d.monto
      )
      insert into public.otorgamiento_evento (otorgamiento_id, tipo, motivo, actor_id, metadatos)
      select p_id, 'DESEMBOLSO_ANULADO',
             case when p_accion = 'REVOCAR' then 'Revocacion del otorgamiento' else 'Cumplimiento forzado del otorgamiento' end,
             p_actor, jsonb_build_object('desembolso_id', a.id, 'monto', a.monto)
        from anulados a;
      v_anulados := v_pend;
    end if;
  end if;

  update public.otorgamiento
     set estado = v_nuevo, version = version + 1, estado_cambiado_en = now()
   where id = p_id;

  insert into public.otorgamiento_evento (otorgamiento_id, tipo, estado_anterior, estado_nuevo, motivo, actor_id, metadatos)
  values (p_id, v_tipo, o.estado, v_nuevo, p_motivo, p_actor, jsonb_build_object('desembolsos_anulados', v_anulados, 'forzar', coalesce(p_forzar, false)));

  return jsonb_build_object(
    'id', p_id, 'beneficiario_id', o.beneficiario_id, 'beneficio_codigo', o.beneficio_codigo,
    'convocatoria_id', o.convocatoria_id, 'estado_anterior', o.estado, 'estado_nuevo', v_nuevo,
    'version', o.version + 1, 'desembolsos_anulados', v_anulados
  );
end;
$$;
revoke all on function public.fn_cambiar_estado_otorgamiento(uuid, text, text, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.fn_cambiar_estado_otorgamiento(uuid, text, text, uuid, integer, boolean) to service_role;

-- 4.4 Programar desembolso. El primer desembolso de un otorgamiento que excede cupo/presupuesto exige confirmacion.
create or replace function public.fn_programar_desembolso(
  p_otorgamiento_id  uuid,
  p_monto            numeric,
  p_fecha_programada date,
  p_concepto         text,
  p_actor            uuid,
  p_confirmar        boolean default false,
  p_motivo_excedente text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o          public.otorgamiento%rowtype;
  v_total    numeric;
  v_previos  integer;
  v_excede   boolean := false;
  v_cb       record;
  v_ocup     integer;
  v_comp     numeric;
  v_dp       public.datos_pago_st%rowtype;
  v_cuenta   uuid;
  v_id       uuid;
begin
  select * into o from public.otorgamiento where id = p_otorgamiento_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0001';
  end if;
  if o.estado <> 'ACTIVO' then
    raise exception 'OTORGAMIENTO_ESTADO_INVALIDO' using errcode = 'P0001', detail = o.estado;
  end if;

  if o.beneficio_codigo = 'ST' and o.cuenta_pago_id is null then
    select * into v_dp from public.datos_pago_st d where d.postulacion_id = o.postulacion_id;
    if not found then
      raise exception 'CUENTA_PAGO_FALTANTE' using errcode = 'P0001';
    end if;
    insert into public.cuenta_pago (beneficiario_id, postulacion_id, tipo, entidad, ultimos4)
    values (o.beneficiario_id, o.postulacion_id, v_dp.tipo, v_dp.entidad, v_dp.ultimos4)
    on conflict (postulacion_id) do update set tipo = excluded.tipo, entidad = excluded.entidad, ultimos4 = excluded.ultimos4
    returning id into v_cuenta;
    update public.otorgamiento set cuenta_pago_id = v_cuenta where id = o.id;
  end if;

  select coalesce(sum(d.monto), 0), count(*) into v_total, v_previos
    from public.desembolso d where d.otorgamiento_id = o.id and d.estado <> 'ANULADO';
  if v_total + p_monto > o.monto_aprobado then
    raise exception 'MONTO_EXCEDE_APROBADO' using errcode = 'P0001',
      detail = format('acumulado=%s;monto=%s;aprobado=%s', v_total, p_monto, o.monto_aprobado);
  end if;

  if v_previos = 0 then
    v_excede := o.excede_cupo or o.excede_presupuesto;
    if not v_excede then
      select cb.cupos_estimados, cb.presupuesto_asignado into v_cb
        from public.convocatoria_beneficio cb join public.beneficio b on b.id = cb.beneficio_id
       where cb.convocatoria_id = o.convocatoria_id and b.codigo = o.beneficio_codigo;
      if found then
        select count(*), coalesce(sum(x.monto_aprobado), 0) into v_ocup, v_comp
          from public.otorgamiento x
         where x.convocatoria_id = o.convocatoria_id and x.beneficio_codigo = o.beneficio_codigo
           and x.estado in ('ACTIVO', 'SUSPENDIDO', 'CUMPLIDO');
        v_excede := v_ocup > v_cb.cupos_estimados or v_comp > v_cb.presupuesto_asignado;
      end if;
    end if;
    if v_excede and not coalesce(p_confirmar, false) then
      raise exception 'EXCEDE_PRESUPUESTO' using errcode = 'P0001';
    end if;
  end if;

  insert into public.desembolso (otorgamiento_id, estado, monto, concepto, fecha_programada, confirmar_excedente, motivo_excedente, registrado_por)
  values (o.id, 'PROGRAMADO', p_monto, p_concepto, p_fecha_programada, v_excede and coalesce(p_confirmar, false), case when v_excede then p_motivo_excedente else null end, p_actor)
  returning id into v_id;

  insert into public.otorgamiento_evento (otorgamiento_id, tipo, motivo, actor_id, metadatos)
  values (o.id, 'DESEMBOLSO_PROGRAMADO', p_concepto, p_actor,
          jsonb_build_object('desembolso_id', v_id, 'monto', p_monto, 'fecha_programada', p_fecha_programada, 'excedente_confirmado', v_excede));

  return jsonb_build_object('id', v_id, 'otorgamiento_id', o.id, 'beneficiario_id', o.beneficiario_id, 'excedente_confirmado', v_excede);
end;
$$;
revoke all on function public.fn_programar_desembolso(uuid, numeric, date, text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.fn_programar_desembolso(uuid, numeric, date, text, uuid, boolean, text) to service_role;

-- 4.5 Pagar desembolso (PROGRAMADO -> PAGADO) con referencia unica.
create or replace function public.fn_pagar_desembolso(
  p_id           uuid,
  p_referencia   text,
  p_fecha_pago   date,
  p_actor        uuid,
  p_carga_id     uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.desembolso%rowtype;
  o public.otorgamiento%rowtype;
begin
  select * into d from public.desembolso where id = p_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0001';
  end if;
  select * into o from public.otorgamiento where id = d.otorgamiento_id for update;
  if d.estado <> 'PROGRAMADO' then
    raise exception 'DESEMBOLSO_ESTADO_INVALIDO' using errcode = 'P0001', detail = d.estado;
  end if;
  if o.estado <> 'ACTIVO' then
    raise exception 'OTORGAMIENTO_ESTADO_INVALIDO' using errcode = 'P0001', detail = o.estado;
  end if;

  begin
    update public.desembolso
       set estado = 'PAGADO', referencia = p_referencia, fecha_pago = p_fecha_pago, registrado_por = p_actor, carga_id = p_carga_id
     where id = p_id;
  exception when unique_violation then
    raise exception 'REFERENCIA_DUPLICADA' using errcode = 'P0001';
  end;

  insert into public.otorgamiento_evento (otorgamiento_id, tipo, motivo, actor_id, metadatos)
  values (o.id, 'DESEMBOLSO_PAGADO', null, p_actor,
          jsonb_build_object('desembolso_id', p_id, 'monto', d.monto, 'fecha_pago', p_fecha_pago, 'carga_id', p_carga_id));

  return jsonb_build_object('id', p_id, 'otorgamiento_id', o.id, 'beneficiario_id', o.beneficiario_id,
                            'beneficio_codigo', o.beneficio_codigo, 'monto', d.monto, 'fecha_pago', p_fecha_pago);
end;
$$;
revoke all on function public.fn_pagar_desembolso(uuid, text, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_pagar_desembolso(uuid, text, date, uuid, uuid) to service_role;

-- 4.6 Anular desembolso (solo PROGRAMADO).
create or replace function public.fn_anular_desembolso(p_id uuid, p_motivo text, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.desembolso%rowtype;
  o public.otorgamiento%rowtype;
begin
  select * into d from public.desembolso where id = p_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0001';
  end if;
  if d.estado <> 'PROGRAMADO' then
    raise exception 'DESEMBOLSO_ESTADO_INVALIDO' using errcode = 'P0001', detail = d.estado;
  end if;
  select * into o from public.otorgamiento where id = d.otorgamiento_id;

  update public.desembolso set estado = 'ANULADO', motivo_anulacion = p_motivo where id = p_id;
  insert into public.otorgamiento_evento (otorgamiento_id, tipo, motivo, actor_id, metadatos)
  values (d.otorgamiento_id, 'DESEMBOLSO_ANULADO', p_motivo, p_actor, jsonb_build_object('desembolso_id', p_id, 'monto', d.monto));

  return jsonb_build_object('id', p_id, 'otorgamiento_id', d.otorgamiento_id, 'beneficiario_id', o.beneficiario_id);
end;
$$;
revoke all on function public.fn_anular_desembolso(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_anular_desembolso(uuid, text, uuid) to service_role;

-- 4.7 Carga masiva de pagos: TODO O NADA. p_filas = [{fila, otorgamiento_id, desembolso_id|null, monto, fecha_pago, referencia}].
-- Sin desembolso_id: se usa el PROGRAMADO mas antiguo del otorgamiento con el mismo monto; si no hay, se programa uno nuevo y se paga.
create or replace function public.fn_aplicar_carga_pagos(
  p_filas      jsonb,
  p_actor      uuid,
  p_sha256     text,
  p_nombre     text,
  p_resultado  jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_carga   uuid;
  f         jsonb;
  v_des     uuid;
  v_oto     uuid;
  v_monto   numeric;
  v_n       integer := 0;
  v_prog    jsonb;
  v_fila    integer;
begin
  if exists (select 1 from public.carga_pagos c where c.archivo_sha256 = p_sha256) then
    raise exception 'CARGA_DUPLICADA' using errcode = 'P0001';
  end if;

  insert into public.carga_pagos (admin_id, archivo_nombre, archivo_sha256, filas_total, filas_ok, filas_error, resultado)
  values (p_actor, p_nombre, p_sha256, jsonb_array_length(p_filas), jsonb_array_length(p_filas), 0, coalesce(p_resultado, '[]'::jsonb))
  returning id into v_carga;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := (f ->> 'fila')::integer;
    begin
      v_des := nullif(f ->> 'desembolso_id', '')::uuid;
      v_oto := (f ->> 'otorgamiento_id')::uuid;
      v_monto := (f ->> 'monto')::numeric;

      if v_des is null then
        select d.id into v_des from public.desembolso d
         where d.otorgamiento_id = v_oto and d.estado = 'PROGRAMADO' and d.monto = v_monto
         order by d.fecha_programada nulls last, d.creado_en limit 1;
      end if;
      if v_des is null then
        v_prog := public.fn_programar_desembolso(v_oto, v_monto, (f ->> 'fecha_pago')::date, 'Pago registrado por carga masiva', p_actor, false, null);
        v_des := (v_prog ->> 'id')::uuid;
      end if;
      perform public.fn_pagar_desembolso(v_des, f ->> 'referencia', (f ->> 'fecha_pago')::date, p_actor, v_carga);
      v_n := v_n + 1;
    exception when others then
      raise exception 'CARGA_CON_ERRORES' using errcode = 'P0001', detail = format('fila %s: %s', v_fila, sqlerrm);
    end;
  end loop;

  return jsonb_build_object('carga_id', v_carga, 'aplicadas', v_n);
end;
$$;
revoke all on function public.fn_aplicar_carga_pagos(jsonb, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_aplicar_carga_pagos(jsonb, uuid, text, text, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Configuracion (idempotente). A confirmar con el Acuerdo 023.
-- -----------------------------------------------------------------------------
insert into public.configuracion_sistema (clave, valor, tipo, categoria, descripcion, valor_defecto, valor_min, valor_max, pendiente_confirmar) values
  ('ALERTA_PRESUPUESTO_PORCENTAJE', '90', 'INT', 'ALERTAS', 'Porcentaje de ocupacion de cupos/presupuesto de un beneficio desde el que seguimiento_beneficios alerta al administrador', '90', '50', '100', false),
  ('ELEGIBILIDAD_RENOVACION_ESTADOS', 'ACTIVO,CUMPLIDO', 'STRING', 'ACUERDO', 'Estados de otorgamiento en la convocatoria inmediatamente anterior que habilitan RENOVACION (separados por coma). A confirmar con el Acuerdo 023', 'ACTIVO,CUMPLIDO', null, null, true),
  ('ELEGIBILIDAD_REINTEGRO_PERIODOS_SIN_APOYO_MIN', '1', 'INT', 'ACUERDO', 'Periodos (convocatorias) minimos sin apoyo entre el ultimo otorgamiento y la convocatoria actual para habilitar REINTEGRO. A confirmar con el Acuerdo 023', '1', '0', '10', true),
  ('ELEGIBILIDAD_REINTEGRO_EXCLUYE_REVOCADOS', 'true', 'BOOL', 'ACUERDO', 'Si es true, un otorgamiento REVOCADO no habilita REINTEGRO ni RENOVACION. A confirmar con el Acuerdo 023', 'true', null, null, true)
on conflict (clave) do nothing;

-- Fin de 0018_seguimiento_beneficios.sql
