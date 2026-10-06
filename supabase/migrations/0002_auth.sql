-- =============================================================================
-- FOEST - Migracion 0002_auth: soporte del modulo auth sobre Supabase Auth
-- (DECISIONES.md seccion 19: sin tabla SESION ni rotacion manual de tokens).
--
-- Idempotente. Asume aplicada 0001_base.sql (usuario, beneficiario, acudiente,
-- consentimiento_datos, configuracion_sistema, auditoria_evento).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. intento_login: contadores de fuerza bruta (DECISIONES seccion 7)
--    Sin FK a usuario: registra tambien correos inexistentes sin revelar
--    su existencia. Solo la API (service_role) escribe y lee.
-- -----------------------------------------------------------------------------
create table if not exists public.intento_login (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  ip         text,
  exitoso    boolean not null default false,
  creado_en  timestamptz not null default now()
);
comment on table public.intento_login is 'Intentos de inicio de sesion (por IP y por email) para fuerza bruta; se purga a los 30 dias';

create index if not exists ix_intento_login_email on public.intento_login (email, creado_en desc);
create index if not exists ix_intento_login_ip on public.intento_login (ip, creado_en desc);

alter table public.intento_login enable row level security;
-- Sin politicas: anon/authenticated no leen ni escriben; service_role omite RLS.
revoke all on public.intento_login from anon, authenticated;

-- Purga (la invoca un job de la API o el administrador desde el editor SQL).
create or replace function public.fn_purgar_intentos_login(p_dias integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrados integer;
begin
  delete from public.intento_login where creado_en < now() - make_interval(days => p_dias);
  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;
revoke all on function public.fn_purgar_intentos_login(integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Texto vigente del consentimiento (Ley 1581) en configuracion_sistema.
--    La version vigente ya existe (CONSENTIMIENTO_TEXTO_VERSION_VIGENTE);
--    aqui se agrega el texto que muestra el registro publico. El modulo de
--    catalogos puede reemplazarlo al publicar nuevas versiones.
-- -----------------------------------------------------------------------------
insert into public.configuracion_sistema (clave, valor, tipo, categoria, descripcion, valor_defecto, valor_min, valor_max, pendiente_confirmar)
values (
  'CONSENTIMIENTO_TEXTO',
  'En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013, autorizo de manera previa, expresa e informada al Fondo para la Educacion Superior de Tocancipa (FOEST) de la Alcaldia Municipal de Tocancipa para recolectar, almacenar, usar, circular y suprimir mis datos personales, incluidos datos sensibles como la clasificacion del SISBEN, con la finalidad de tramitar, evaluar y hacer seguimiento a mi postulacion a los beneficios educativos del fondo, verificar la informacion aportada ante entidades publicas y privadas, notificarme sobre el estado de mi solicitud y cumplir obligaciones legales. Conozco que puedo ejercer mis derechos de acceso, rectificacion, actualizacion y supresion mediante los canales dispuestos por la Alcaldia. Si el titular es menor de edad, esta autorizacion la otorga su representante legal o acudiente.',
  'TEXT',
  'PRIVACIDAD',
  'Texto vigente del consentimiento de tratamiento de datos mostrado en el registro',
  null, null, null, true
)
on conflict (clave) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Lectura publica (anon) del texto y version del consentimiento.
--    La API ya lo entrega en GET /auth/consentimiento/vigente con service_role;
--    la funcion permite tambien consultarlo con la anon key sin abrir la tabla.
-- -----------------------------------------------------------------------------
create or replace function public.consentimiento_vigente()
returns table (version integer, texto text)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select valor::integer from public.configuracion_sistema where clave = 'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE'), 1) as version,
    coalesce((select valor from public.configuracion_sistema where clave = 'CONSENTIMIENTO_TEXTO'), '') as texto;
$$;
grant execute on function public.consentimiento_vigente() to anon, authenticated;
