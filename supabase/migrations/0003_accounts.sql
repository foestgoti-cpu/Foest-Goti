-- =============================================================================
-- FOEST - Migracion 0003_accounts: cuentas de funcionarios, perfiles de
-- beneficiarios y habeas data (docs/modules/accounts.md, DECISIONES section 19).
--
-- Idempotente. Asume 0001_base.sql aplicada (beneficiario, acudiente,
-- funcionario, consentimiento_datos y usuario ya existen).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. usuario.ultimo_login sincronizado desde auth.users.last_sign_in_at
--    (permite saber si un funcionario invitado ya acepto la invitacion).
-- -----------------------------------------------------------------------------
create or replace function public.handle_auth_user_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.usuario set ultimo_login = new.last_sign_in_at where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute function public.handle_auth_user_login();

create index if not exists ix_usuario_email_lower on public.usuario (lower(email));

-- -----------------------------------------------------------------------------
-- 2. Funcionario: fecha de invitacion (para reenvios) y busqueda
-- -----------------------------------------------------------------------------
alter table public.funcionario add column if not exists invitado_en timestamptz;
alter table public.funcionario add column if not exists invitacion_reenviada_en timestamptz;
create index if not exists ix_funcionario_dependencia on public.funcionario (dependencia);

-- -----------------------------------------------------------------------------
-- 3. Solicitudes de habeas data (Ley 1581 de 2012)
-- -----------------------------------------------------------------------------
create table if not exists public.solicitud_habeas_data (
  id                 uuid primary key default gen_random_uuid(),
  usuario_id         uuid not null references public.usuario(id) on delete cascade,
  tipo               text not null check (tipo in ('ACCESO', 'RECTIFICACION', 'SUPRESION')),
  detalle            text not null check (char_length(detalle) between 10 and 2000),
  estado             text not null default 'RADICADA' check (estado in ('RADICADA', 'RESUELTA', 'RECHAZADA')),
  motivo_resolucion  text,
  resuelta_por       uuid references public.usuario(id),
  creada_en          timestamptz not null default now(),
  resuelta_en        timestamptz
);
comment on table public.solicitud_habeas_data is 'Solicitudes de acceso, rectificacion y supresion del titular (Ley 1581 de 2012)';
create index if not exists ix_habeas_usuario on public.solicitud_habeas_data (usuario_id, creada_en desc);
create index if not exists ix_habeas_estado on public.solicitud_habeas_data (estado, creada_en desc);

-- Una sola solicitud RADICADA por tipo y titular
create unique index if not exists uq_habeas_radicada_por_tipo
  on public.solicitud_habeas_data (usuario_id, tipo) where estado = 'RADICADA';

alter table public.solicitud_habeas_data enable row level security;

drop policy if exists habeas_select on public.solicitud_habeas_data;
create policy habeas_select on public.solicitud_habeas_data for select to authenticated
  using (usuario_id = auth.uid() or public.es_administrador());

drop policy if exists habeas_insert_propia on public.solicitud_habeas_data;
create policy habeas_insert_propia on public.solicitud_habeas_data for insert to authenticated
  with check (usuario_id = auth.uid() and public.es_beneficiario());

grant select, insert on public.solicitud_habeas_data to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Vistas de cuenta (perfil + estado del usuario) para los listados del
--    Administrador. security_invoker: aplican las politicas de las tablas base.
-- -----------------------------------------------------------------------------
create or replace view public.funcionario_cuenta
with (security_invoker = true)
as
select
  f.id,
  f.usuario_id,
  u.email,
  u.activo,
  u.ultimo_login,
  (u.ultimo_login is null)         as invitacion_pendiente,
  f.nombres,
  f.apellidos,
  f.cargo,
  f.dependencia,
  f.invitado_en,
  f.invitacion_reenviada_en,
  f.creado_en,
  f.actualizado_en
from public.funcionario f
join public.usuario u on u.id = f.usuario_id;

create or replace view public.beneficiario_cuenta
with (security_invoker = true)
as
select
  b.id,
  b.usuario_id,
  u.email,
  u.activo,
  u.ultimo_login,
  b.tipo_documento,
  b.numero_documento,
  b.nombres,
  b.apellidos,
  b.fecha_nacimiento,
  b.es_menor,
  b.perfil_completo,
  b.anonimizado,
  b.creado_en,
  b.actualizado_en
from public.beneficiario b
join public.usuario u on u.id = b.usuario_id;

grant select on public.funcionario_cuenta, public.beneficiario_cuenta to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Conteo de expedientes pendientes de un funcionario (REASSIGNMENT_REQUIRED):
--    asignaciones de comite activas y postulaciones PENDIENTE / EN_EVALUACION
--    de esas convocatorias. La API tambien lo calcula; esta funcion sirve a
--    reportes y al modulo asignaciones.
-- -----------------------------------------------------------------------------
create or replace function public.fn_funcionario_pendientes(p_funcionario_usuario_id uuid)
returns table (asignaciones_activas integer, expedientes_pendientes integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.asignacion_funcionario af
      where af.funcionario_id = p_funcionario_usuario_id and af.retirado_en is null),
    (select count(*)::int from public.postulacion p
      where p.estado in ('PENDIENTE', 'EN_EVALUACION')
        and p.convocatoria_id in (
          select af.convocatoria_id from public.asignacion_funcionario af
          where af.funcionario_id = p_funcionario_usuario_id and af.retirado_en is null));
$$;
revoke all on function public.fn_funcionario_pendientes(uuid) from public, anon;
grant execute on function public.fn_funcionario_pendientes(uuid) to authenticated;

-- Fin de 0003_accounts.sql
