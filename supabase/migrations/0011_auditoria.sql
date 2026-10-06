-- =============================================================================
-- 0011_auditoria.sql — Modulo auditoria (docs/modules/auditoria.md)
--
-- Asume aplicadas 0001..0009 (auditoria_evento, fn_bloquear_modificacion,
-- configuracion_sistema con RETENCION_AUDITORIA_ANIOS, notificacion, fn_config_int).
-- Idempotente: puede ejecutarse varias veces desde el editor SQL de Supabase.
--
-- Decision de implementacion (prompt 1.1): la cadena de hashes NO se calcula en
-- apps/api/src/shared/audit.ts sino en un trigger BEFORE INSERT de esta
-- migracion. Asi cualquier insercion (API, consumidor de la cola, RPCs SQL)
-- queda encadenada, y el valor `hash_evento` que envia el helper de Node se
-- reemplaza por el hash canonico calculado en SQL (unica fuente de verdad, lo
-- que permite re-verificar la cadena desde la base de datos).
--
--   secuencia   := nextval(...) tomado bajo pg_advisory_xact_lock (orden total)
--   hash_previo := hash_evento del evento con la secuencia inmediatamente anterior
--   hash_evento := sha256( canonico(evento) || coalesce(hash_previo,'') )
--
-- Objetos:
--   tablas     auditoria_evento_pendiente, auditoria_integridad
--   funciones  fn_auditoria_canonico, fn_auditoria_hash, fn_auditoria_encadenar,
--              fn_auditoria_bloquear_modificacion, fn_auditoria_verificar_integridad,
--              fn_auditoria_resumen_integridad, fn_auditoria_candidatos_retencion,
--              fn_auditoria_purgar_retencion
--   triggers   trg_auditoria_encadenar (before insert), trg_auditoria_inmutable (redefinido)
--   RLS        select para administrador en auditoria_integridad; ninguna politica en
--              auditoria_evento_pendiente (solo service_role)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas auxiliares
-- -----------------------------------------------------------------------------
create table if not exists public.auditoria_evento_pendiente (
  id                 uuid primary key default gen_random_uuid(),
  evento             jsonb not null,
  estado             text not null default 'ENCOLADO' check (estado in ('ENCOLADO','PROCESADO','FALLIDO')),
  intentos           integer not null default 0,
  ultimo_error       text,
  proximo_intento_en timestamptz not null default now(),
  creado_en          timestamptz not null default now(),
  procesado_en       timestamptz,
  evento_id          uuid
);
comment on table public.auditoria_evento_pendiente is
  'Cola persistente de eventos de auditoria fuera de transaccion de negocio (login fallido, acceso denegado). El job del modulo auditoria los inserta en auditoria_evento con reintentos y backoff.';
create index if not exists ix_auditoria_pendiente_estado on public.auditoria_evento_pendiente (estado, proximo_intento_en);

create table if not exists public.auditoria_integridad (
  id                      uuid primary key default gen_random_uuid(),
  secuencia_desde         bigint,
  secuencia_hasta         bigint,
  total_verificados       bigint not null default 0,
  valida                  boolean not null,
  primera_secuencia_rota  bigint,
  detalle                 text,
  origen                  text not null default 'JOB' check (origen in ('JOB','MANUAL','MIGRACION','PURGA')),
  verificada_en           timestamptz not null default now()
);
comment on table public.auditoria_integridad is
  'Resultado de cada verificacion de la cadena de hashes de auditoria_evento y registro de las purgas por retencion.';
create index if not exists ix_auditoria_integridad_fecha on public.auditoria_integridad (verificada_en desc);

-- -----------------------------------------------------------------------------
-- 2. Canonizacion y hash
-- -----------------------------------------------------------------------------
-- Representacion canonica: jsonb::text es deterministico (claves ordenadas por
-- longitud y luego alfabeticamente). La fecha se normaliza a UTC con microsegundos.
create or replace function public.fn_auditoria_canonico(e public.auditoria_evento)
returns text
language sql
immutable
as $$
  select jsonb_build_object(
    'id',            e.id,
    'secuencia',     e.secuencia,
    'actor_id',      e.actor_id,
    'actor_tipo',    e.actor_tipo,
    'actor_rol',     e.actor_rol,
    'accion',        e.accion,
    'entidad',       e.entidad,
    'entidad_id',    e.entidad_id,
    'resultado',     e.resultado,
    'datos_antes',   e.datos_antes,
    'datos_despues', e.datos_despues,
    'metadatos',     e.metadatos,
    'request_id',    e.request_id,
    'sesion_id',     e.sesion_id,
    'ip_origen',     e.ip_origen,
    'user_agent',    e.user_agent,
    'registrado_en', to_char(e.registrado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text
$$;

create or replace function public.fn_auditoria_hash(p_canonico text, p_hash_previo text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(p_canonico || coalesce(p_hash_previo, ''), 'UTF8')), 'hex')
$$;

-- -----------------------------------------------------------------------------
-- 3. Trigger de encadenamiento (BEFORE INSERT)
-- -----------------------------------------------------------------------------
create or replace function public.fn_auditoria_encadenar()
returns trigger
language plpgsql
as $$
declare
  v_previo text;
begin
  -- Seccion critica corta: serializa la asignacion de secuencia y hash_previo.
  perform pg_advisory_xact_lock(hashtext('public.auditoria_evento.cadena'));

  -- La secuencia se toma DENTRO del bloqueo para que el orden de la cadena
  -- coincida con el orden de secuencia aunque haya transacciones concurrentes.
  new.secuencia := nextval(pg_get_serial_sequence('public.auditoria_evento', 'secuencia'));
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.registrado_en is null then new.registrado_en := now(); end if;
  if new.metadatos is null then new.metadatos := '{}'::jsonb; end if;

  select a.hash_evento into v_previo
  from public.auditoria_evento a
  where a.secuencia < new.secuencia
  order by a.secuencia desc
  limit 1;

  new.hash_previo := v_previo;
  new.hash_evento := public.fn_auditoria_hash(public.fn_auditoria_canonico(new), v_previo);
  return new;
end;
$$;

drop trigger if exists trg_auditoria_encadenar on public.auditoria_evento;
create trigger trg_auditoria_encadenar before insert on public.auditoria_evento
  for each row execute function public.fn_auditoria_encadenar();

-- -----------------------------------------------------------------------------
-- 4. Inmutabilidad (segunda barrera): UPDATE siempre bloqueado; DELETE solo desde
--    la purga por retencion (fn_auditoria_purgar_retencion fija la variable local).
-- -----------------------------------------------------------------------------
create or replace function public.fn_auditoria_bloquear_modificacion()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('auditoria.purga_autorizada', true), '') = 'on' then
    return old;
  end if;
  raise exception 'La tabla auditoria_evento es inmutable (append-only): operacion % no permitida', tg_op
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_auditoria_inmutable on public.auditoria_evento;
create trigger trg_auditoria_inmutable before update or delete on public.auditoria_evento
  for each row execute function public.fn_auditoria_bloquear_modificacion();

-- El rol de la aplicacion (service_role) solo inserta y lee; la purga corre como
-- owner via SECURITY DEFINER.
revoke update, delete, truncate on public.auditoria_evento from anon, authenticated, service_role;
revoke update, delete, truncate on public.auditoria_integridad from anon, authenticated;
revoke all on public.auditoria_evento_pendiente from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Verificacion de la cadena
--    p_desde/p_hasta acotan el rango (null = desde el inicio / hasta el final).
--    El primer evento del rango se contrasta con el evento anterior si existe
--    (si fue purgado por retencion, se toma como ancla y no se marca ruptura).
-- -----------------------------------------------------------------------------
create or replace function public.fn_auditoria_verificar_integridad(
  p_desde bigint default null,
  p_hasta bigint default null,
  p_origen text default 'JOB'
)
returns public.auditoria_integridad
language plpgsql
security definer
set search_path = public
as $$
declare
  r             public.auditoria_evento;
  v_esperado    text;
  v_previo      text := null;
  v_tiene_ancla boolean := false;
  v_total       bigint := 0;
  v_rota        bigint := null;
  v_detalle     text := null;
  v_min         bigint;
  v_max         bigint;
  v_fila        public.auditoria_integridad;
begin
  select min(secuencia), max(secuencia) into v_min, v_max
  from public.auditoria_evento
  where (p_desde is null or secuencia >= p_desde)
    and (p_hasta is null or secuencia <= p_hasta);

  if v_min is not null then
    select hash_evento into v_previo
    from public.auditoria_evento
    where secuencia < v_min
    order by secuencia desc
    limit 1;
    v_tiene_ancla := found;

    for r in
      select * from public.auditoria_evento
      where secuencia between v_min and v_max
      order by secuencia
    loop
      v_total := v_total + 1;
      if v_total > 1 or v_tiene_ancla then
        if r.hash_previo is distinct from v_previo then
          v_rota := r.secuencia;
          v_detalle := format('hash_previo no coincide en la secuencia %s', r.secuencia);
          exit;
        end if;
      end if;
      v_esperado := public.fn_auditoria_hash(public.fn_auditoria_canonico(r), r.hash_previo);
      if r.hash_evento is distinct from v_esperado then
        v_rota := r.secuencia;
        v_detalle := format('hash_evento no coincide en la secuencia %s', r.secuencia);
        exit;
      end if;
      v_previo := r.hash_evento;
    end loop;
  end if;

  insert into public.auditoria_integridad (secuencia_desde, secuencia_hasta, total_verificados, valida, primera_secuencia_rota, detalle, origen)
  values (v_min, v_max, v_total, v_rota is null, v_rota, v_detalle, coalesce(p_origen, 'JOB'))
  returning * into v_fila;

  -- La verificacion tambien queda en la bitacora (actor SISTEMA).
  insert into public.auditoria_evento (actor_tipo, accion, entidad, entidad_id, resultado, metadatos)
  values (
    'SISTEMA', 'VERIFICACION_INTEGRIDAD', 'AUDITORIA', v_fila.id::text,
    case when v_rota is null then 'EXITO' else 'FALLO' end,
    jsonb_build_object('secuencia_desde', v_min, 'secuencia_hasta', v_max, 'total_verificados', v_total,
                       'valida', v_rota is null, 'primera_secuencia_rota', v_rota, 'origen', coalesce(p_origen, 'JOB'))
  );

  return v_fila;
end;
$$;
revoke execute on function public.fn_auditoria_verificar_integridad(bigint, bigint, text) from public, anon, authenticated;

-- Resumen para GET /auditoria/integridad (lectura; la llama la API con service_role).
create or replace function public.fn_auditoria_resumen_integridad()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'secuencia_actual', (select max(secuencia) from public.auditoria_evento),
    'pendientes_verificacion', (
      select count(*) from public.auditoria_evento
      where secuencia > coalesce((select max(secuencia_hasta) from public.auditoria_integridad where origen <> 'PURGA'), 0)
    ),
    'cola', jsonb_build_object(
      'encolados', (select count(*) from public.auditoria_evento_pendiente where estado = 'ENCOLADO'),
      'fallidos',  (select count(*) from public.auditoria_evento_pendiente where estado = 'FALLIDO')
    )
  )
$$;
revoke execute on function public.fn_auditoria_resumen_integridad() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Retencion (RETENCION_AUDITORIA_ANIOS, por defecto 10)
--    - fn_auditoria_candidatos_retencion: cuantos eventos superan la retencion (job mensual
--      e informe al administrador; no borra nada).
--    - fn_auditoria_purgar_retencion: UNICA via de borrado. Solo el owner (editor SQL de
--      Supabase, rol de mantenimiento) puede ejecutarla: se revoca a anon, authenticated y
--      service_role. Registra la purga en auditoria_integridad y en la bitacora.
--    Pendiente (seguimiento_beneficios): excluir eventos de postulaciones con otorgamiento
--    no CUMPLIDO cuando exista la tabla otorgamiento.
-- -----------------------------------------------------------------------------
create or replace function public.fn_auditoria_candidatos_retencion()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lim as (
    select now() - make_interval(years => public.fn_config_int('RETENCION_AUDITORIA_ANIOS', 10)) as limite,
           public.fn_config_int('RETENCION_AUDITORIA_ANIOS', 10) as anios
  )
  select jsonb_build_object(
    'retencion_anios', (select anios from lim),
    'limite', (select limite from lim),
    'candidatos', (select count(*) from public.auditoria_evento, lim where registrado_en < lim.limite),
    'secuencia_max_candidata', (select max(secuencia) from public.auditoria_evento, lim where registrado_en < lim.limite)
  )
$$;
revoke execute on function public.fn_auditoria_candidatos_retencion() from public, anon, authenticated;

create or replace function public.fn_auditoria_purgar_retencion(p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anios   integer := public.fn_config_int('RETENCION_AUDITORIA_ANIOS', 10);
  v_limite  timestamptz := now() - make_interval(years => public.fn_config_int('RETENCION_AUDITORIA_ANIOS', 10));
  v_min     bigint;
  v_max     bigint;
  v_total   bigint;
  v_fila    public.auditoria_integridad;
begin
  if not p_confirmar then
    raise exception 'La purga exige confirmacion explicita: fn_auditoria_purgar_retencion(true)' using errcode = 'P0001';
  end if;
  select min(secuencia), max(secuencia), count(*) into v_min, v_max, v_total
  from public.auditoria_evento where registrado_en < v_limite;
  if coalesce(v_total, 0) = 0 then
    return jsonb_build_object('eliminados', 0, 'retencion_anios', v_anios, 'limite', v_limite);
  end if;

  perform pg_advisory_xact_lock(hashtext('public.auditoria_evento.cadena'));
  perform set_config('auditoria.purga_autorizada', 'on', true);
  delete from public.auditoria_evento where registrado_en < v_limite;
  perform set_config('auditoria.purga_autorizada', 'off', true);

  insert into public.auditoria_integridad (secuencia_desde, secuencia_hasta, total_verificados, valida, detalle, origen)
  values (v_min, v_max, v_total, true, format('Purga por retencion (%s anios): %s eventos anteriores a %s', v_anios, v_total, v_limite), 'PURGA')
  returning * into v_fila;

  insert into public.auditoria_evento (actor_tipo, accion, entidad, entidad_id, resultado, metadatos)
  values ('SISTEMA', 'PURGA_RETENCION', 'AUDITORIA', v_fila.id::text, 'EXITO',
          jsonb_build_object('eliminados', v_total, 'secuencia_desde', v_min, 'secuencia_hasta', v_max,
                             'retencion_anios', v_anios, 'limite', v_limite));

  return jsonb_build_object('eliminados', v_total, 'secuencia_desde', v_min, 'secuencia_hasta', v_max,
                            'retencion_anios', v_anios, 'limite', v_limite, 'integridad_id', v_fila.id);
end;
$$;
revoke execute on function public.fn_auditoria_purgar_retencion(boolean) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Sellado inicial: los eventos insertados antes de esta migracion tienen
--    hash_previo nulo y un hash calculado en Node. Se recalcula toda la cadena
--    UNA sola vez (si no existe ninguna verificacion registrada) con el trigger de
--    inmutabilidad desactivado temporalmente, y se deja constancia en
--    auditoria_integridad (origen MIGRACION).
-- -----------------------------------------------------------------------------
do $$
declare
  r        public.auditoria_evento;
  v_previo text := null;
  v_hash   text;
  v_n      bigint := 0;
begin
  if exists (select 1 from public.auditoria_integridad) then
    return;
  end if;
  alter table public.auditoria_evento disable trigger trg_auditoria_inmutable;
  for r in select * from public.auditoria_evento order by secuencia loop
    v_hash := public.fn_auditoria_hash(public.fn_auditoria_canonico(r), v_previo);
    update public.auditoria_evento set hash_previo = v_previo, hash_evento = v_hash where id = r.id;
    v_previo := v_hash;
    v_n := v_n + 1;
  end loop;
  alter table public.auditoria_evento enable trigger trg_auditoria_inmutable;
  insert into public.auditoria_integridad (secuencia_desde, secuencia_hasta, total_verificados, valida, detalle, origen)
  values ((select min(secuencia) from public.auditoria_evento), (select max(secuencia) from public.auditoria_evento),
          v_n, true, format('Sellado inicial de la cadena de hashes (%s eventos)', v_n), 'MIGRACION');
exception when others then
  alter table public.auditoria_evento enable trigger trg_auditoria_inmutable;
  raise;
end $$;

-- -----------------------------------------------------------------------------
-- 8. RLS
-- -----------------------------------------------------------------------------
alter table public.auditoria_evento_pendiente enable row level security;
alter table public.auditoria_integridad enable row level security;

-- auditoria_integridad: solo administrador lee; escribe la API (service_role) y las funciones.
drop policy if exists auditoria_integridad_select_admin on public.auditoria_integridad;
create policy auditoria_integridad_select_admin on public.auditoria_integridad for select to authenticated
  using (public.es_administrador());

-- auditoria_evento_pendiente: sin politicas -> solo service_role (bypass RLS).
