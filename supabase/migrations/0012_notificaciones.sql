-- =============================================================================
-- 0012_notificaciones.sql - Modulo notificaciones (docs/modules/notificaciones.md)
-- Idempotente. Asume aplicadas 0001..0009 (tabla notificacion, configuracion_sistema,
-- festivo y funciones fn_config_int / fn_dias_habiles_entre de 0009).
--
-- Contenido:
--   1. evento_outbox            outbox transaccional de correo (estados, reintentos, backoff)
--   2. entrega_correo           un registro por destinatario e intento (entregabilidad)
--   3. preferencia_notificacion preferencias minimas por usuario
--   4. destinatario_suprimido   rebotes duros / quejas / supresion manual
--   5. funciones del worker     fn_outbox_tomar_lote (FOR UPDATE SKIP LOCKED),
--                               fn_outbox_recuperar_atascados, fn_notificaciones_limpiar
--   6. RLS y privilegios
-- La API escribe en estas tablas con service_role (bypass RLS); los usuarios
-- autenticados solo leen/escriben sus preferencias y el administrador lee el resto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. evento_outbox
-- -----------------------------------------------------------------------------
create table if not exists public.evento_outbox (
  id                  uuid primary key default gen_random_uuid(),
  notificacion_id     uuid references public.notificacion(id) on delete set null,
  usuario_id          uuid references public.usuario(id) on delete set null,
  tipo                text not null,
  plantilla_version   integer not null default 1,
  payload             jsonb not null default '{}'::jsonb,
  estado              text not null default 'PENDIENTE'
                      check (estado in ('PENDIENTE','EN_PROCESO','ENVIADO','FALLIDO','MUERTO','SUPRIMIDO')),
  intentos            integer not null default 0,
  proximo_intento_en  timestamptz not null default now(),
  ultimo_error        text,
  clave_idempotencia  text not null,
  creado_en           timestamptz not null default now(),
  tomado_en           timestamptz,
  procesado_en        timestamptz
);
comment on table public.evento_outbox is 'Outbox transaccional de correo (notificaciones.md). Nada se envia dentro de la transaccion de negocio.';

create unique index if not exists uq_evento_outbox_idempotencia on public.evento_outbox (clave_idempotencia);
create index if not exists ix_evento_outbox_estado_proximo on public.evento_outbox (estado, proximo_intento_en);
create index if not exists ix_evento_outbox_usuario on public.evento_outbox (usuario_id, creado_en desc);
create index if not exists ix_evento_outbox_tipo on public.evento_outbox (tipo, creado_en desc);

-- -----------------------------------------------------------------------------
-- 2. entrega_correo
-- -----------------------------------------------------------------------------
create table if not exists public.entrega_correo (
  id                    uuid primary key default gen_random_uuid(),
  evento_outbox_id      uuid not null references public.evento_outbox(id) on delete cascade,
  destinatario_email    text not null,
  rol_destinatario      text not null check (rol_destinatario in ('PRINCIPAL','ALTERNATIVO','ACUDIENTE')),
  estado                text not null default 'ENVIADO'
                        check (estado in ('ENVIADO','ENTREGADO','REBOTADO','QUEJA','FALLIDO')),
  id_mensaje_proveedor  text,
  codigo_rebote         text check (codigo_rebote is null or codigo_rebote in ('HARD','SOFT')),
  detalle_rebote        text,
  enviado_en            timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);
comment on table public.entrega_correo is 'Intento de entrega por destinatario; el ID del proveedor permite correlacionar rebotes.';

create index if not exists ix_entrega_correo_evento on public.entrega_correo (evento_outbox_id);
create index if not exists ix_entrega_correo_email on public.entrega_correo (lower(destinatario_email), enviado_en desc);
create index if not exists ix_entrega_correo_proveedor on public.entrega_correo (id_mensaje_proveedor) where id_mensaje_proveedor is not null;
create index if not exists ix_entrega_correo_estado on public.entrega_correo (estado, enviado_en desc);

drop trigger if exists trg_entrega_correo_actualizado_en on public.entrega_correo;
create trigger trg_entrega_correo_actualizado_en before update on public.entrega_correo
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- 3. preferencia_notificacion
-- -----------------------------------------------------------------------------
create table if not exists public.preferencia_notificacion (
  usuario_id            uuid primary key references public.usuario(id) on delete cascade,
  correo_recordatorios  boolean not null default true,
  correo_informativos   boolean not null default true,
  actualizado_en        timestamptz not null default now()
);
comment on table public.preferencia_notificacion is 'Preferencias minimas. Los correos de seguridad y los obligatorios (plazos/derechos) no se desactivan.';

drop trigger if exists trg_preferencia_notificacion_actualizado_en on public.preferencia_notificacion;
create trigger trg_preferencia_notificacion_actualizado_en before update on public.preferencia_notificacion
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- 4. destinatario_suprimido
-- -----------------------------------------------------------------------------
create table if not exists public.destinatario_suprimido (
  email         text primary key,
  motivo        text not null check (motivo in ('REBOTE_DURO','QUEJA','MANUAL')),
  detalle       text,
  desde         timestamptz not null default now(),
  levantado_por uuid references public.usuario(id) on delete set null,
  levantado_en  timestamptz
);
comment on table public.destinatario_suprimido is 'Correos con rebote duro o queja. Mientras levantado_en es null no se envia nada a esa direccion.';

create index if not exists ix_destinatario_suprimido_activo on public.destinatario_suprimido (email) where levantado_en is null;

-- -----------------------------------------------------------------------------
-- 5. Funciones del worker (solo service_role)
-- -----------------------------------------------------------------------------

-- Toma un lote de eventos PENDIENTE vencidos, los marca EN_PROCESO y los devuelve.
-- FOR UPDATE SKIP LOCKED permite varios procesos de API sin duplicar envios.
create or replace function public.fn_outbox_tomar_lote(p_limite integer default 20)
returns setof public.evento_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with lote as (
    select e.id
    from public.evento_outbox e
    where e.estado = 'PENDIENTE'
      and e.proximo_intento_en <= now()
    order by e.proximo_intento_en asc, e.creado_en asc
    limit greatest(1, least(coalesce(p_limite, 20), 200))
    for update skip locked
  )
  update public.evento_outbox e
     set estado = 'EN_PROCESO', tomado_en = now()
    from lote
   where e.id = lote.id
  returning e.*;
end;
$$;
revoke execute on function public.fn_outbox_tomar_lote(integer) from public, anon, authenticated;
grant execute on function public.fn_outbox_tomar_lote(integer) to service_role;

-- Devuelve a PENDIENTE los eventos EN_PROCESO con mas de p_minutos (worker caido).
create or replace function public.fn_outbox_recuperar_atascados(p_minutos integer default 10)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.evento_outbox
     set estado = 'PENDIENTE',
         tomado_en = null,
         ultimo_error = coalesce(ultimo_error, 'Recuperado: EN_PROCESO por mas de ' || greatest(1, coalesce(p_minutos, 10)) || ' minutos')
   where estado = 'EN_PROCESO'
     and tomado_en is not null
     and tomado_en < now() - make_interval(mins => greatest(1, coalesce(p_minutos, 10)));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.fn_outbox_recuperar_atascados(integer) from public, anon, authenticated;
grant execute on function public.fn_outbox_recuperar_atascados(integer) to service_role;

-- Limpieza mensual: borra notificaciones leidas mas antiguas que la retencion y
-- compacta el payload de eventos ENVIADO con mas de 30 dias.
create or replace function public.fn_notificaciones_limpiar(p_meses integer default null)
returns table (notificaciones_borradas integer, eventos_compactados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meses integer := coalesce(p_meses, public.fn_config_int('RETENCION_NOTIFICACIONES_MESES', 24));
  v_n integer;
  v_e integer;
begin
  delete from public.notificacion
   where leida = true
     and creada_en < now() - make_interval(months => greatest(1, v_meses));
  get diagnostics v_n = row_count;

  update public.evento_outbox
     set payload = jsonb_build_object('compactado', true, 'tipo', tipo)
   where estado = 'ENVIADO'
     and procesado_en < now() - interval '30 days'
     and coalesce(payload ->> 'compactado', 'false') <> 'true';
  get diagnostics v_e = row_count;

  return query select v_n, v_e;
end;
$$;
revoke execute on function public.fn_notificaciones_limpiar(integer) from public, anon, authenticated;
grant execute on function public.fn_notificaciones_limpiar(integer) to service_role;

-- -----------------------------------------------------------------------------
-- 6. RLS y privilegios
-- -----------------------------------------------------------------------------
alter table public.evento_outbox            enable row level security;
alter table public.entrega_correo           enable row level security;
alter table public.preferencia_notificacion enable row level security;
alter table public.destinatario_suprimido   enable row level security;

-- evento_outbox / entrega_correo / destinatario_suprimido: solo lectura del administrador;
-- las escrituras las hace la API con service_role.
drop policy if exists evento_outbox_select_admin on public.evento_outbox;
create policy evento_outbox_select_admin on public.evento_outbox for select to authenticated
  using (public.es_administrador());

drop policy if exists entrega_correo_select_admin on public.entrega_correo;
create policy entrega_correo_select_admin on public.entrega_correo for select to authenticated
  using (public.es_administrador());

drop policy if exists destinatario_suprimido_select_admin on public.destinatario_suprimido;
create policy destinatario_suprimido_select_admin on public.destinatario_suprimido for select to authenticated
  using (public.es_administrador());

-- preferencia_notificacion: cada usuario lee y escribe solo la propia.
drop policy if exists preferencia_notificacion_select_propia on public.preferencia_notificacion;
create policy preferencia_notificacion_select_propia on public.preferencia_notificacion for select to authenticated
  using (usuario_id = auth.uid());
drop policy if exists preferencia_notificacion_insert_propia on public.preferencia_notificacion;
create policy preferencia_notificacion_insert_propia on public.preferencia_notificacion for insert to authenticated
  with check (usuario_id = auth.uid());
drop policy if exists preferencia_notificacion_update_propia on public.preferencia_notificacion;
create policy preferencia_notificacion_update_propia on public.preferencia_notificacion for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

grant select on public.evento_outbox, public.entrega_correo, public.destinatario_suprimido to authenticated;
grant select, insert, update on public.preferencia_notificacion to authenticated;
grant all on public.evento_outbox, public.entrega_correo, public.preferencia_notificacion, public.destinatario_suprimido to service_role;
