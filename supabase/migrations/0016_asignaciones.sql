-- =============================================================================
-- 0016_asignaciones.sql - Modulo asignaciones (docs/modules/asignaciones.md)
-- Idempotente. Asume aplicadas 0001..0013 (postulacion, asignacion_funcionario,
-- usuario, funcionario, postulacion_envio, postulacion_beneficio).
--
-- Contenido:
--   1. postulacion_asignacion  asignacion por expediente (indice unico parcial: una ACTIVA)
--   2. conflicto_interes       exclusion permanente del funcionario sobre la postulacion
--   3. trigger de inmutabilidad de asignaciones LIBERADA
--   4. funciones de apoyo (solo service_role): fn_asignacion_tomar, fn_asignacion_reasignar,
--      fn_asignacion_declarar_conflicto, fn_asignacion_bandeja
--   5. RLS: el funcionario lee las suyas, el administrador todas; escrituras solo service_role
--
-- La clave de configuracion ASIGNACION_ALERTA_DIAS_HABILES del .md equivale a la ya sembrada
-- ALERTA_ASIGNACION_SIN_MOVIMIENTO_DIAS_HABILES (0001/0010): no se crea una nueva.
-- Los permisos asignacion:* ya existen en el seed de 0001; no se agregan permisos nuevos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. postulacion_asignacion
-- -----------------------------------------------------------------------------
create table if not exists public.postulacion_asignacion (
  id                     uuid primary key default gen_random_uuid(),
  postulacion_id         uuid not null references public.postulacion(id) on delete cascade,
  funcionario_id         uuid not null references public.usuario(id),
  estado                 text not null default 'ACTIVA' check (estado in ('ACTIVA', 'LIBERADA')),
  ciclo                  integer not null default 1 check (ciclo >= 0),
  origen                 text not null default 'TOMA' check (origen in ('TOMA', 'REASIGNACION_ADMIN', 'REASIGNACION_MASIVA')),
  motivo_liberacion      text check (motivo_liberacion in (
                           'LIBERACION_VOLUNTARIA', 'CONFLICTO_INTERES', 'REASIGNACION', 'DESHABILITACION',
                           'CAMBIO_COMITE', 'DICTAMEN_EMITIDO', 'DESISTIMIENTO')),
  observacion_liberacion text,
  asignada_en            timestamptz not null default now(),
  asignada_por           uuid references public.usuario(id),
  liberada_en            timestamptz,
  liberada_por           uuid references public.usuario(id),
  ultimo_movimiento_en   timestamptz not null default now(),
  ultima_alerta_en       timestamptz,
  constraint ck_asignacion_estado_liberacion check (
    (estado = 'ACTIVA'   and liberada_en is null and motivo_liberacion is null) or
    (estado = 'LIBERADA' and liberada_en is not null and motivo_liberacion is not null)
  )
);
comment on table public.postulacion_asignacion is 'Asignacion de un expediente a un evaluador (asignaciones.md). Una sola fila ACTIVA por postulacion.';

-- Una sola asignacion ACTIVA por postulacion: arbitra la carrera de "tomar" a nivel de BD.
create unique index if not exists uq_asignacion_activa on public.postulacion_asignacion (postulacion_id) where estado = 'ACTIVA';
create index if not exists ix_asignacion_postulacion on public.postulacion_asignacion (postulacion_id, asignada_en);
create index if not exists ix_asignacion_funcionario_activa on public.postulacion_asignacion (funcionario_id) where estado = 'ACTIVA';
create index if not exists ix_asignacion_movimiento_activa on public.postulacion_asignacion (ultimo_movimiento_en) where estado = 'ACTIVA';

-- -----------------------------------------------------------------------------
-- 2. conflicto_interes (exclusion permanente; no hay endpoint para revertirla)
-- -----------------------------------------------------------------------------
create table if not exists public.conflicto_interes (
  id             uuid primary key default gen_random_uuid(),
  postulacion_id uuid not null references public.postulacion(id) on delete cascade,
  funcionario_id uuid not null references public.usuario(id),
  asignacion_id  uuid references public.postulacion_asignacion(id) on delete set null,
  motivo         text not null check (char_length(btrim(motivo)) >= 15),
  declarado_en   timestamptz not null default now(),
  constraint uq_conflicto_interes_par unique (postulacion_id, funcionario_id)
);
comment on table public.conflicto_interes is 'Impedimento declarado por un funcionario: queda excluido de forma permanente de esa postulacion.';
create index if not exists ix_conflicto_funcionario on public.conflicto_interes (funcionario_id);

-- -----------------------------------------------------------------------------
-- 3. Inmutabilidad: una asignacion LIBERADA no cambia ni vuelve a ACTIVA
-- -----------------------------------------------------------------------------
create or replace function public.fn_asignacion_inmutable()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'LIBERADA' then
    raise exception 'ASIGNACION_INMUTABLE: una asignacion liberada no puede modificarse' using errcode = 'P0001';
  end if;
  if new.postulacion_id <> old.postulacion_id or new.funcionario_id <> old.funcionario_id then
    raise exception 'ASIGNACION_INMUTABLE: no se puede cambiar la postulacion ni el funcionario de una asignacion' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_asignacion_inmutable on public.postulacion_asignacion;
create trigger trg_asignacion_inmutable before update on public.postulacion_asignacion
  for each row execute function public.fn_asignacion_inmutable();

-- -----------------------------------------------------------------------------
-- 4. Funciones de apoyo (security definer; solo service_role)
-- -----------------------------------------------------------------------------

-- Valida que el funcionario pueda recibir el expediente: comite vigente, cuenta activa y sin conflicto.
create or replace function public.fn_asignacion_funcionario_elegible(p_convocatoria_id uuid, p_postulacion_id uuid, p_funcionario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1
             from public.asignacion_funcionario af
             join public.usuario u on u.id = af.funcionario_id
            where af.convocatoria_id = p_convocatoria_id
              and af.funcionario_id = p_funcionario_id
              and af.retirado_en is null
              and u.activo and u.rol = 'FUNCIONARIO')
     and not exists (
           select 1 from public.conflicto_interes ci
            where ci.postulacion_id = p_postulacion_id and ci.funcionario_id = p_funcionario_id);
$$;

-- Toma de un expediente del pool. Bloquea la postulacion (FOR UPDATE); el indice unico parcial
-- es la barrera final. Errores (prefijo del mensaje): NO_ENCONTRADO (404), YA_ASIGNADA (409).
create or replace function public.fn_asignacion_tomar(
  p_postulacion_id uuid,
  p_funcionario_id uuid,
  p_asignada_por   uuid default null,
  p_origen         text default 'TOMA'
)
returns public.postulacion_asignacion
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.postulacion%rowtype;
  v_fila public.postulacion_asignacion;
begin
  select * into v_post from public.postulacion where id = p_postulacion_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO: la postulacion no existe' using errcode = 'P0002';
  end if;
  if not public.fn_asignacion_funcionario_elegible(v_post.convocatoria_id, v_post.id, p_funcionario_id) then
    raise exception 'NO_ENCONTRADO: la postulacion no esta disponible para el funcionario' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.postulacion_asignacion where postulacion_id = v_post.id and estado = 'ACTIVA') then
    raise exception 'YA_ASIGNADA: el expediente ya fue tomado por otro funcionario' using errcode = 'P0001';
  end if;
  if v_post.estado <> 'PENDIENTE' then
    raise exception 'NO_ENCONTRADO: la postulacion no esta en el pool' using errcode = 'P0002';
  end if;

  begin
    insert into public.postulacion_asignacion (postulacion_id, funcionario_id, ciclo, origen, asignada_por)
    values (v_post.id, p_funcionario_id, v_post.ciclo, p_origen, coalesce(p_asignada_por, p_funcionario_id))
    returning * into v_fila;
  exception when unique_violation then
    raise exception 'YA_ASIGNADA: el expediente ya fue tomado por otro funcionario' using errcode = 'P0001';
  end;
  return v_fila;
end;
$$;

-- Reasignacion con destino: cierra la ACTIVA (REASIGNACION) y crea otra en la misma transaccion.
-- La postulacion permanece EN_EVALUACION. Errores: SIN_ASIGNACION_ACTIVA (409), DESTINO_INVALIDO (422),
-- NO_ENCONTRADO (404).
create or replace function public.fn_asignacion_reasignar(
  p_postulacion_id uuid,
  p_destino_id     uuid,
  p_actor_id       uuid,
  p_origen         text default 'REASIGNACION_ADMIN',
  p_observacion    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post   public.postulacion%rowtype;
  v_activa public.postulacion_asignacion;
  v_nueva  public.postulacion_asignacion;
begin
  select * into v_post from public.postulacion where id = p_postulacion_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO: la postulacion no existe' using errcode = 'P0002';
  end if;
  select * into v_activa from public.postulacion_asignacion where postulacion_id = v_post.id and estado = 'ACTIVA' for update;
  if not found then
    raise exception 'SIN_ASIGNACION_ACTIVA: la postulacion no tiene una asignacion activa' using errcode = 'P0001';
  end if;
  if v_activa.funcionario_id = p_destino_id then
    raise exception 'DESTINO_INVALIDO: el destino ya es el titular del expediente' using errcode = 'P0001';
  end if;
  if not public.fn_asignacion_funcionario_elegible(v_post.convocatoria_id, v_post.id, p_destino_id) then
    raise exception 'DESTINO_INVALIDO: el destino debe ser un funcionario activo del comite, sin conflicto de interes sobre el expediente' using errcode = 'P0001';
  end if;

  update public.postulacion_asignacion
     set estado = 'LIBERADA', motivo_liberacion = 'REASIGNACION', liberada_en = now(),
         liberada_por = p_actor_id, observacion_liberacion = p_observacion, ultimo_movimiento_en = now()
   where id = v_activa.id;

  insert into public.postulacion_asignacion (postulacion_id, funcionario_id, ciclo, origen, asignada_por)
  values (v_post.id, p_destino_id, v_post.ciclo, p_origen, p_actor_id)
  returning * into v_nueva;

  return jsonb_build_object(
    'anterior_id', v_activa.id,
    'anterior_funcionario_id', v_activa.funcionario_id,
    'nueva', to_jsonb(v_nueva));
end;
$$;

-- Conflicto de interes: registra la exclusion permanente y, si el funcionario es el titular ACTIVO,
-- cierra su asignacion (CONFLICTO_INTERES). Tambien admite declararlo desde el pool (sin asignacion).
-- Devuelve true si cerro una asignacion. Errores: NO_ENCONTRADO (404).
create or replace function public.fn_asignacion_declarar_conflicto(
  p_postulacion_id uuid,
  p_funcionario_id uuid,
  p_motivo         text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post   public.postulacion%rowtype;
  v_activa public.postulacion_asignacion;
  v_ci     public.conflicto_interes;
begin
  select * into v_post from public.postulacion where id = p_postulacion_id for update;
  if not found then
    raise exception 'NO_ENCONTRADO: la postulacion no existe' using errcode = 'P0002';
  end if;
  select * into v_activa from public.postulacion_asignacion
   where postulacion_id = v_post.id and estado = 'ACTIVA' and funcionario_id = p_funcionario_id for update;
  if not found then
    -- Sin asignacion propia: solo si el expediente esta en su pool visible.
    if not (v_post.estado = 'PENDIENTE'
            and not exists (select 1 from public.postulacion_asignacion where postulacion_id = v_post.id and estado = 'ACTIVA')
            and public.fn_asignacion_funcionario_elegible(v_post.convocatoria_id, v_post.id, p_funcionario_id)) then
      raise exception 'NO_ENCONTRADO: la postulacion no esta disponible para el funcionario' using errcode = 'P0002';
    end if;
  end if;

  insert into public.conflicto_interes (postulacion_id, funcionario_id, asignacion_id, motivo)
  values (v_post.id, p_funcionario_id, v_activa.id, btrim(p_motivo))
  on conflict (postulacion_id, funcionario_id) do nothing
  returning * into v_ci;
  if v_ci.id is null then
    select * into v_ci from public.conflicto_interes where postulacion_id = v_post.id and funcionario_id = p_funcionario_id;
  end if;

  if v_activa.id is not null then
    update public.postulacion_asignacion
       set estado = 'LIBERADA', motivo_liberacion = 'CONFLICTO_INTERES', liberada_en = now(),
           liberada_por = p_funcionario_id, observacion_liberacion = btrim(p_motivo), ultimo_movimiento_en = now()
     where id = v_activa.id;
  end if;

  return jsonb_build_object('asignacion_liberada', v_activa.id is not null, 'declarado_en', v_ci.declarado_en);
end;
$$;

-- Bandeja del funcionario: pool PENDIENTE de las convocatorias de su comite (sin conflicto) + sus ACTIVAS.
-- Solo columnas de la lista blanca ResumenBandejaDto (nunca datos personales ni sensibles).
create or replace function public.fn_asignacion_bandeja(
  p_funcionario  uuid,
  p_vista        text default 'TODAS',
  p_convocatoria uuid default null,
  p_tipo         text default null,
  p_beneficio    text default null,
  p_limit        integer default 20,
  p_offset       integer default 0
)
returns table (
  postulacion_id       uuid,
  convocatoria_id      uuid,
  convocatoria_nombre  text,
  convocatoria_anio    integer,
  convocatoria_semestre integer,
  tipo_solicitud       text,
  estado               text,
  ciclo                integer,
  version              integer,
  enviada_en           timestamptz,
  beneficios           text[],
  asignacion_estado    text,
  asignada_en          timestamptz,
  total                bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.id as postulacion_id, p.convocatoria_id, c.nombre as convocatoria_nombre,
           c.anio::integer as convocatoria_anio, c.semestre::integer as convocatoria_semestre,
           p.tipo_solicitud::text as tipo_solicitud, p.estado::text as estado, p.ciclo, p.version,
           coalesce((select pe.enviado_en from public.postulacion_envio pe
                      where pe.postulacion_id = p.id and pe.ciclo = p.ciclo limit 1), p.enviada_en) as enviada_en,
           coalesce((select array_agg(pb.beneficio_codigo order by pb.beneficio_codigo)
                       from public.postulacion_beneficio pb where pb.postulacion_id = p.id), '{}'::text[]) as beneficios,
           pa.id as pa_id, pa.estado as asignacion_estado, pa.asignada_en
      from public.postulacion p
      join public.convocatoria c on c.id = p.convocatoria_id
      left join public.postulacion_asignacion pa on pa.postulacion_id = p.id and pa.estado = 'ACTIVA'
     where (
             (p_vista in ('TODAS', 'POOL')
              and p.estado = 'PENDIENTE' and pa.id is null
              and exists (select 1 from public.asignacion_funcionario af
                           where af.convocatoria_id = p.convocatoria_id and af.funcionario_id = p_funcionario and af.retirado_en is null)
              and not exists (select 1 from public.conflicto_interes ci
                               where ci.postulacion_id = p.id and ci.funcionario_id = p_funcionario))
          or (p_vista in ('TODAS', 'MIS_ASIGNACIONES') and pa.funcionario_id = p_funcionario)
           )
       and (p_convocatoria is null or p.convocatoria_id = p_convocatoria)
       and (p_tipo is null or p.tipo_solicitud::text = p_tipo)
       and (p_beneficio is null or exists (select 1 from public.postulacion_beneficio pb2
                                            where pb2.postulacion_id = p.id and pb2.beneficio_codigo = p_beneficio))
  )
  select b.postulacion_id, b.convocatoria_id, b.convocatoria_nombre, b.convocatoria_anio, b.convocatoria_semestre,
         b.tipo_solicitud, b.estado, b.ciclo, b.version, b.enviada_en, b.beneficios,
         b.asignacion_estado, b.asignada_en, count(*) over () as total
    from base b
   order by (b.pa_id is null), b.enviada_en asc nulls last, b.postulacion_id
   limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke execute on function public.fn_asignacion_funcionario_elegible(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fn_asignacion_tomar(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.fn_asignacion_reasignar(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.fn_asignacion_declarar_conflicto(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.fn_asignacion_bandeja(uuid, text, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_asignacion_funcionario_elegible(uuid, uuid, uuid) to service_role;
grant execute on function public.fn_asignacion_tomar(uuid, uuid, uuid, text) to service_role;
grant execute on function public.fn_asignacion_reasignar(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.fn_asignacion_declarar_conflicto(uuid, uuid, text) to service_role;
grant execute on function public.fn_asignacion_bandeja(uuid, text, uuid, text, text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 5. RLS: el funcionario lee las suyas; el administrador todas; escrituras solo service_role
-- -----------------------------------------------------------------------------
alter table public.postulacion_asignacion enable row level security;
alter table public.conflicto_interes      enable row level security;

drop policy if exists postulacion_asignacion_select_propia on public.postulacion_asignacion;
create policy postulacion_asignacion_select_propia on public.postulacion_asignacion for select to authenticated
  using (funcionario_id = auth.uid() or public.es_administrador());

drop policy if exists conflicto_interes_select_propio on public.conflicto_interes;
create policy conflicto_interes_select_propio on public.conflicto_interes for select to authenticated
  using (funcionario_id = auth.uid() or public.es_administrador());

revoke all on public.postulacion_asignacion, public.conflicto_interes from anon, authenticated;
grant select on public.postulacion_asignacion, public.conflicto_interes to authenticated;
grant all on public.postulacion_asignacion, public.conflicto_interes to service_role;

-- Fin de 0016_asignaciones.sql
