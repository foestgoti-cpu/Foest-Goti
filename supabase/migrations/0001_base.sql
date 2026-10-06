-- =============================================================================
-- FOEST - Fondo para la Educacion Superior de Tocancipa
-- Migracion 0001_base: esquema fundacional (DECISIONES.md section 19)
--
-- Idempotente donde PostgreSQL lo permite (IF NOT EXISTS, DO $$ ... $$, ON CONFLICT).
-- Aplicar con `supabase db push` (CLI enlazada) o pegando este archivo en el
-- editor SQL del proyecto https://kixjejmewgynzrppowfv.supabase.co
--
-- Convenciones: tablas en snake_case singular; ids uuid; fechas timestamptz (UTC);
-- RLS activo en todas las tablas; escrituras de sistema via service_role (bypass).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensiones
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- busquedas (SNIES, nombres)
create extension if not exists "unaccent";   -- busquedas sin tildes

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'rol_usuario') then
    create type public.rol_usuario as enum ('ADMINISTRADOR', 'FUNCIONARIO', 'BENEFICIARIO');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_postulacion') then
    create type public.estado_postulacion as enum
      ('BORRADOR', 'PENDIENTE', 'EN_EVALUACION', 'EN_CORRECCION', 'APROBADA', 'RECHAZADA', 'DESISTIDA');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_convocatoria') then
    create type public.estado_convocatoria as enum
      ('BORRADOR', 'HABILITADA', 'SUSPENDIDA', 'CERRADA', 'ARCHIVADA');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_solicitud') then
    create type public.tipo_solicitud as enum ('PRIMERA_VEZ', 'RENOVACION', 'REINTEGRO');
  end if;
  if not exists (select 1 from pg_type where typname = 'categoria_beneficio') then
    create type public.categoria_beneficio as enum ('MATRICULA', 'TRANSPORTE', 'ESPECIAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_documento_identidad') then
    create type public.tipo_documento_identidad as enum ('CC', 'TI', 'CE', 'PS');
  end if;
  if not exists (select 1 from pg_type where typname = 'actor_tipo') then
    create type public.actor_tipo as enum ('BENEFICIARIO', 'FUNCIONARIO', 'ADMINISTRADOR', 'SISTEMA');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_ampliacion') then
    create type public.tipo_ampliacion as enum ('PRORROGA', 'REAPERTURA');
  end if;
  if not exists (select 1 from pg_type where typname = 'origen_cambio_estado') then
    create type public.origen_cambio_estado as enum ('ADMIN', 'CRON', 'TIEMPO_REAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'severidad_notificacion') then
    create type public.severidad_notificacion as enum ('INFO', 'ADVERTENCIA', 'CRITICA');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Funciones utilitarias
-- -----------------------------------------------------------------------------

-- Rol del JWT: auth.users.app_metadata.rol (escrito solo por la API con service_role).
create or replace function public.auth_rol()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'rol',
    ''
  );
$$;

comment on function public.auth_rol() is 'Rol del usuario autenticado leido de app_metadata.rol del JWT (vacio si anonimo).';

create or replace function public.es_administrador()
returns boolean language sql stable as $$ select public.auth_rol() = 'ADMINISTRADOR' $$;

create or replace function public.es_funcionario()
returns boolean language sql stable as $$ select public.auth_rol() = 'FUNCIONARIO' $$;

create or replace function public.es_beneficiario()
returns boolean language sql stable as $$ select public.auth_rol() = 'BENEFICIARIO' $$;

-- Trigger generico de actualizado_en
create or replace function public.fn_set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- Bloqueo generico de UPDATE/DELETE (tablas append-only / inmutables)
create or replace function public.fn_bloquear_modificacion()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La tabla % es inmutable (append-only): operacion % no permitida', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Roles, permisos y matriz (roles_permissions.md)
-- -----------------------------------------------------------------------------
create table if not exists public.rol (
  id           uuid primary key default gen_random_uuid(),
  nombre       public.rol_usuario not null unique,
  descripcion  text not null default '',
  es_base      boolean not null default true,
  creado_en    timestamptz not null default now()
);

create table if not exists public.permiso (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique check (codigo ~ '^[a-z_]+:[a-z_]+$'),
  descripcion  text not null default '',
  categoria    text not null default '',
  alcance      text not null default 'GLOBAL' check (alcance in ('GLOBAL','ASIGNADO','PROPIO','COMITE','PUBLICO'))
);

create table if not exists public.rol_permiso (
  rol_id       uuid not null references public.rol(id) on delete cascade,
  permiso_id   uuid not null references public.permiso(id) on delete cascade,
  primary key (rol_id, permiso_id)
);

insert into public.rol (nombre, descripcion) values
  ('ADMINISTRADOR', 'Gestiona y supervisa la plataforma; no evalua'),
  ('FUNCIONARIO',   'Evalua expedientes con asignacion activa propia'),
  ('BENEFICIARIO',  'Estudiante que presenta postulaciones')
on conflict (nombre) do nothing;

-- Catalogo de permisos (codigo, categoria, alcance, descripcion)
insert into public.permiso (codigo, categoria, alcance, descripcion) values
  ('funcionario:crear',              'CUENTAS',       'GLOBAL',   'Crear funcionario por invitacion'),
  ('funcionario:editar',             'CUENTAS',       'GLOBAL',   'Editar datos institucionales del funcionario'),
  ('funcionario:estado',             'CUENTAS',       'GLOBAL',   'Activar/deshabilitar funcionario'),
  ('funcionario:restablecer_clave',  'CUENTAS',       'GLOBAL',   'Restablecimiento manual de clave'),
  ('funcionario:consultar',          'CUENTAS',       'GLOBAL',   'Consultar funcionarios'),
  ('administrador:consultar',        'CUENTAS',       'GLOBAL',   'Listar cuentas administradoras'),
  ('administrador:estado',           'CUENTAS',       'GLOBAL',   'Activar/deshabilitar administrador (protege al ultimo)'),
  ('beneficiario:consultar',         'CUENTAS',       'ASIGNADO', 'Admin: global; funcionario: solo con asignacion propia'),
  ('beneficiario:editar_perfil',     'CUENTAS',       'PROPIO',   'Editar el perfil propio (/beneficiarios/me)'),
  ('beneficiario:estado',            'CUENTAS',       'GLOBAL',   'Deshabilitar/reactivar beneficiario con motivo'),
  ('beneficiario:corregir_documento','CUENTAS',       'GLOBAL',   'Corregir documento de identidad con motivo'),
  ('habeas_data:solicitar',          'CUENTAS',       'PROPIO',   'Radicar solicitud de habeas data'),
  ('habeas_data:gestionar',          'CUENTAS',       'GLOBAL',   'Resolver solicitudes de habeas data'),
  ('convocatoria:crear',             'CONVOCATORIAS', 'GLOBAL',   'Crear convocatoria'),
  ('convocatoria:editar',            'CONVOCATORIAS', 'GLOBAL',   'Editar convocatoria'),
  ('convocatoria:habilitar',         'CONVOCATORIAS', 'GLOBAL',   'Habilitar convocatoria'),
  ('convocatoria:deshabilitar',      'CONVOCATORIAS', 'GLOBAL',   'Suspender convocatoria con motivo'),
  ('convocatoria:rehabilitar',       'CONVOCATORIAS', 'GLOBAL',   'Rehabilitar convocatoria suspendida'),
  ('convocatoria:ampliar',           'CONVOCATORIAS', 'GLOBAL',   'Prorrogar o reabrir con motivo'),
  ('convocatoria:archivar',          'CONVOCATORIAS', 'GLOBAL',   'Archivar convocatoria cerrada'),
  ('convocatoria:comite',            'CONVOCATORIAS', 'GLOBAL',   'Asignar/retirar funcionarios del comite'),
  ('convocatoria:consultar',         'CONVOCATORIAS', 'COMITE',   'Beneficiario: abiertas; funcionario: su comite; admin: todas'),
  ('catalogo:consultar',             'CATALOGOS',     'PUBLICO',  'Lectura de catalogos'),
  ('catalogo:administrar',           'CATALOGOS',     'GLOBAL',   'Administrar catalogos'),
  ('configuracion:consultar',        'CATALOGOS',     'GLOBAL',   'Consultar configuracion (funcionario: no sensible)'),
  ('configuracion:editar',           'CATALOGOS',     'GLOBAL',   'Editar configuracion con auditoria'),
  ('postulacion:crear',              'POSTULACIONES', 'PROPIO',   'Crear postulacion propia'),
  ('postulacion:editar',             'POSTULACIONES', 'PROPIO',   'Editar borrador / campos observados'),
  ('postulacion:enviar',             'POSTULACIONES', 'PROPIO',   'Enviar postulacion'),
  ('postulacion:subsanar',           'POSTULACIONES', 'PROPIO',   'Subsanar postulacion'),
  ('postulacion:desistir',           'POSTULACIONES', 'PROPIO',   'Desistir postulacion'),
  ('postulacion:eliminar_borrador',  'POSTULACIONES', 'PROPIO',   'Eliminar borrador'),
  ('postulacion:consultar',          'POSTULACIONES', 'ASIGNADO', 'Admin: todas; funcionario: asignadas; beneficiario: propias'),
  ('documento:subir',                'DOCUMENTOS',    'PROPIO',   'Subir soporte'),
  ('documento:reemplazar',           'DOCUMENTOS',    'PROPIO',   'Reemplazar soporte'),
  ('documento:eliminar',             'DOCUMENTOS',    'PROPIO',   'Eliminar soporte'),
  ('documento:consultar',            'DOCUMENTOS',    'ASIGNADO', 'URL firmada tras verificar alcance; auditado'),
  ('formato:generar',                'DOCUMENTOS',    'PROPIO',   'Generar GE-F041 y GE-F043'),
  ('asignacion:bandeja',             'EVALUACION',    'COMITE',   'Bandeja minima del pool PENDIENTE'),
  ('asignacion:tomar',               'EVALUACION',    'COMITE',   'Tomar expediente'),
  ('asignacion:liberar',             'EVALUACION',    'ASIGNADO', 'Liberar expediente'),
  ('asignacion:conflicto_interes',   'EVALUACION',    'ASIGNADO', 'Declarar conflicto de interes'),
  ('asignacion:reasignar',           'EVALUACION',    'GLOBAL',   'Reasignar individual o masivo'),
  ('asignacion:consultar',           'EVALUACION',    'GLOBAL',   'Consultar carga y alertas de asignaciones'),
  ('evaluacion:revisar',             'EVALUACION',    'ASIGNADO', 'Revisar expediente asignado'),
  ('evaluacion:dictaminar',          'EVALUACION',    'ASIGNADO', 'Emitir dictamen (titular de asignacion ACTIVA)'),
  ('evaluacion:consultar',           'EVALUACION',    'ASIGNADO', 'Admin: global; funcionario: sus asignaciones'),
  ('labor_social:consultar',         'LABOR_SOCIAL',  'COMITE',   'Beneficiario: propia; funcionario: comite; admin: global'),
  ('labor_social:registrar',         'LABOR_SOCIAL',  'PROPIO',   'Registrar horas de labor social'),
  ('labor_social:validar',           'LABOR_SOCIAL',  'COMITE',   'Validar horas registradas'),
  ('labor_social:gestionar',         'LABOR_SOCIAL',  'GLOBAL',   'Correcciones y cierre'),
  ('seguimiento:consultar',          'SEGUIMIENTO',   'PROPIO',   'Beneficiario: sus otorgamientos; admin: global'),
  ('seguimiento:desembolsar',        'SEGUIMIENTO',   'GLOBAL',   'Registrar desembolsos (descifra datos de pago, auditado)'),
  ('seguimiento:revocar',            'SEGUIMIENTO',   'GLOBAL',   'Revocar otorgamiento con motivo'),
  ('seguimiento:suspender',          'SEGUIMIENTO',   'GLOBAL',   'Suspender otorgamiento con motivo'),
  ('notificacion:consultar',         'NOTIFICACIONES','PROPIO',   'Consultar notificaciones propias'),
  ('notificacion:marcar_leida',      'NOTIFICACIONES','PROPIO',   'Marcar notificaciones propias como leidas'),
  ('notificacion:administrar',       'NOTIFICACIONES','GLOBAL',   'Plantillas, outbox y reintentos'),
  ('dashboard:beneficiario',         'DASHBOARDS',    'PROPIO',   'Portal del beneficiario'),
  ('dashboard:funcionario',          'DASHBOARDS',    'COMITE',   'Metricas del comite propio'),
  ('dashboard:admin',                'DASHBOARDS',    'GLOBAL',   'Panel gerencial'),
  ('reportes:solicitar',             'REPORTES',      'COMITE',   'Admin: global; funcionario: su comite'),
  ('reportes:descargar',             'REPORTES',      'PROPIO',   'Solo reportes solicitados por el propio usuario'),
  ('auditoria:consultar',            'AUDITORIA',     'GLOBAL',   'Consultar bitacora'),
  ('auditoria:exportar',             'AUDITORIA',     'GLOBAL',   'Exportar bitacora (genera EXPORTACION)'),
  ('rol:consultar',                  'SEGURIDAD',     'GLOBAL',   'Consultar roles, catalogo de permisos y matriz rol x permiso')
on conflict (codigo) do update set categoria = excluded.categoria, alcance = excluded.alcance, descripcion = excluded.descripcion;

-- Matriz rol -> permiso. DEBE coincidir con MATRIZ_PERMISOS de packages/shared
-- (una prueba de la API lo verifica). Idempotente: se reemplaza completa.
-- BEGIN SEED rol_permiso
delete from public.rol_permiso;
insert into public.rol_permiso (rol_id, permiso_id)
select r.id, p.id
from (values
  ('ADMINISTRADOR', 'funcionario:crear'),
  ('ADMINISTRADOR', 'funcionario:editar'),
  ('ADMINISTRADOR', 'funcionario:estado'),
  ('ADMINISTRADOR', 'funcionario:restablecer_clave'),
  ('ADMINISTRADOR', 'funcionario:consultar'),
  ('ADMINISTRADOR', 'administrador:consultar'),
  ('ADMINISTRADOR', 'administrador:estado'),
  ('ADMINISTRADOR', 'beneficiario:consultar'),
  ('ADMINISTRADOR', 'beneficiario:estado'),
  ('ADMINISTRADOR', 'beneficiario:corregir_documento'),
  ('ADMINISTRADOR', 'habeas_data:gestionar'),
  ('ADMINISTRADOR', 'convocatoria:crear'),
  ('ADMINISTRADOR', 'convocatoria:editar'),
  ('ADMINISTRADOR', 'convocatoria:habilitar'),
  ('ADMINISTRADOR', 'convocatoria:deshabilitar'),
  ('ADMINISTRADOR', 'convocatoria:rehabilitar'),
  ('ADMINISTRADOR', 'convocatoria:ampliar'),
  ('ADMINISTRADOR', 'convocatoria:archivar'),
  ('ADMINISTRADOR', 'convocatoria:comite'),
  ('ADMINISTRADOR', 'convocatoria:consultar'),
  ('ADMINISTRADOR', 'catalogo:consultar'),
  ('ADMINISTRADOR', 'catalogo:administrar'),
  ('ADMINISTRADOR', 'configuracion:consultar'),
  ('ADMINISTRADOR', 'configuracion:editar'),
  ('ADMINISTRADOR', 'postulacion:consultar'),
  ('ADMINISTRADOR', 'documento:consultar'),
  ('ADMINISTRADOR', 'asignacion:reasignar'),
  ('ADMINISTRADOR', 'asignacion:consultar'),
  ('ADMINISTRADOR', 'evaluacion:consultar'),
  ('ADMINISTRADOR', 'labor_social:consultar'),
  ('ADMINISTRADOR', 'labor_social:gestionar'),
  ('ADMINISTRADOR', 'seguimiento:consultar'),
  ('ADMINISTRADOR', 'seguimiento:desembolsar'),
  ('ADMINISTRADOR', 'seguimiento:revocar'),
  ('ADMINISTRADOR', 'seguimiento:suspender'),
  ('ADMINISTRADOR', 'notificacion:consultar'),
  ('ADMINISTRADOR', 'notificacion:marcar_leida'),
  ('ADMINISTRADOR', 'notificacion:administrar'),
  ('ADMINISTRADOR', 'dashboard:admin'),
  ('ADMINISTRADOR', 'reportes:solicitar'),
  ('ADMINISTRADOR', 'reportes:descargar'),
  ('ADMINISTRADOR', 'auditoria:consultar'),
  ('ADMINISTRADOR', 'auditoria:exportar'),
  ('ADMINISTRADOR', 'rol:consultar'),
  ('FUNCIONARIO', 'beneficiario:consultar'),
  ('FUNCIONARIO', 'convocatoria:consultar'),
  ('FUNCIONARIO', 'catalogo:consultar'),
  ('FUNCIONARIO', 'configuracion:consultar'),
  ('FUNCIONARIO', 'postulacion:consultar'),
  ('FUNCIONARIO', 'documento:consultar'),
  ('FUNCIONARIO', 'asignacion:bandeja'),
  ('FUNCIONARIO', 'asignacion:tomar'),
  ('FUNCIONARIO', 'asignacion:liberar'),
  ('FUNCIONARIO', 'asignacion:conflicto_interes'),
  ('FUNCIONARIO', 'evaluacion:revisar'),
  ('FUNCIONARIO', 'evaluacion:dictaminar'),
  ('FUNCIONARIO', 'evaluacion:consultar'),
  ('FUNCIONARIO', 'labor_social:consultar'),
  ('FUNCIONARIO', 'labor_social:validar'),
  ('FUNCIONARIO', 'notificacion:consultar'),
  ('FUNCIONARIO', 'notificacion:marcar_leida'),
  ('FUNCIONARIO', 'dashboard:funcionario'),
  ('FUNCIONARIO', 'reportes:solicitar'),
  ('FUNCIONARIO', 'reportes:descargar'),
  ('BENEFICIARIO', 'beneficiario:editar_perfil'),
  ('BENEFICIARIO', 'habeas_data:solicitar'),
  ('BENEFICIARIO', 'convocatoria:consultar'),
  ('BENEFICIARIO', 'catalogo:consultar'),
  ('BENEFICIARIO', 'postulacion:crear'),
  ('BENEFICIARIO', 'postulacion:editar'),
  ('BENEFICIARIO', 'postulacion:enviar'),
  ('BENEFICIARIO', 'postulacion:subsanar'),
  ('BENEFICIARIO', 'postulacion:desistir'),
  ('BENEFICIARIO', 'postulacion:eliminar_borrador'),
  ('BENEFICIARIO', 'postulacion:consultar'),
  ('BENEFICIARIO', 'documento:subir'),
  ('BENEFICIARIO', 'documento:reemplazar'),
  ('BENEFICIARIO', 'documento:eliminar'),
  ('BENEFICIARIO', 'documento:consultar'),
  ('BENEFICIARIO', 'formato:generar'),
  ('BENEFICIARIO', 'labor_social:consultar'),
  ('BENEFICIARIO', 'labor_social:registrar'),
  ('BENEFICIARIO', 'seguimiento:consultar'),
  ('BENEFICIARIO', 'notificacion:consultar'),
  ('BENEFICIARIO', 'notificacion:marcar_leida'),
  ('BENEFICIARIO', 'dashboard:beneficiario')
) as m(rol, permiso)
join public.rol r on r.nombre::text = m.rol
join public.permiso p on p.codigo = m.permiso
on conflict do nothing;
-- END SEED rol_permiso

-- -----------------------------------------------------------------------------
-- 4. Usuario (perfil de auth.users) y trigger on_auth_user_created
-- -----------------------------------------------------------------------------
create table if not exists public.usuario (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null unique,
  rol                  public.rol_usuario not null default 'BENEFICIARIO',
  activo               boolean not null default true,
  forzar_cambio_clave  boolean not null default false,
  ultimo_login         timestamptz,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
comment on table public.usuario is 'Perfil de cuenta (replica rol/activo de auth.users.app_metadata). id = auth.users.id';

create index if not exists ix_usuario_rol on public.usuario (rol) where activo;

drop trigger if exists trg_usuario_actualizado_en on public.usuario;
create trigger trg_usuario_actualizado_en before update on public.usuario
  for each row execute function public.fn_set_actualizado_en();

-- Inserta public.usuario al crear auth.users; rol desde app_metadata o BENEFICIARIO.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := coalesce(new.raw_app_meta_data ->> 'rol', 'BENEFICIARIO');
begin
  if v_rol not in ('ADMINISTRADOR', 'FUNCIONARIO', 'BENEFICIARIO') then
    v_rol := 'BENEFICIARIO';
  end if;
  insert into public.usuario (id, email, rol, activo)
  values (new.id, lower(new.email), v_rol::public.rol_usuario, true)
  on conflict (id) do update set email = excluded.email, rol = excluded.rol;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene email y rol sincronizados si cambian en auth.users (p. ej. seed-admin actualiza app_metadata).
create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := new.raw_app_meta_data ->> 'rol';
begin
  update public.usuario
     set email = lower(new.email),
         rol   = case when v_rol in ('ADMINISTRADOR','FUNCIONARIO','BENEFICIARIO') then v_rol::public.rol_usuario else rol end
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, raw_app_meta_data on auth.users
  for each row execute function public.handle_auth_user_updated();

-- -----------------------------------------------------------------------------
-- 5. Perfiles: beneficiario, acudiente, funcionario, consentimiento (accounts.md)
-- -----------------------------------------------------------------------------
create table if not exists public.beneficiario (
  id                     uuid primary key default gen_random_uuid(),
  usuario_id             uuid not null unique references public.usuario(id) on delete cascade,
  tipo_documento         public.tipo_documento_identidad,
  numero_documento       text unique,
  expedido_en            text,
  nombres                text,
  apellidos              text,
  fecha_nacimiento       date,
  es_menor               boolean not null default false,
  perfil_completo        boolean not null default false,
  genero                 text,
  estado_civil           text,
  direccion              text,
  sector                 text check (sector is null or sector in ('Urbano', 'Rural')),
  celular_1              text,
  celular_2              text,
  correo_notificacion_2  text,
  estrato                smallint check (estrato is null or estrato between 1 and 6),
  sisben_categoria       text,
  sisben_puntaje         numeric(6,2),
  anonimizado            boolean not null default false,
  anonimizado_en         timestamptz,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);
comment on table public.beneficiario is 'Perfil del estudiante (Seccion 1 GE-F041). Perfil y SISBEN viven solo aqui.';

drop trigger if exists trg_beneficiario_actualizado_en on public.beneficiario;
create trigger trg_beneficiario_actualizado_en before update on public.beneficiario
  for each row execute function public.fn_set_actualizado_en();

create table if not exists public.acudiente (
  id                uuid primary key default gen_random_uuid(),
  beneficiario_id   uuid not null unique references public.beneficiario(id) on delete cascade,
  tipo_documento    public.tipo_documento_identidad,
  numero_documento  text,
  nombres           text,
  apellidos         text,
  parentesco        text,
  celular           text,
  correo            text,
  actualizado_en    timestamptz not null default now()
);

drop trigger if exists trg_acudiente_actualizado_en on public.acudiente;
create trigger trg_acudiente_actualizado_en before update on public.acudiente
  for each row execute function public.fn_set_actualizado_en();

create table if not exists public.funcionario (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null unique references public.usuario(id) on delete cascade,
  nombres         text not null,
  apellidos       text not null,
  cargo           text,
  dependencia     text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
comment on table public.funcionario is 'Perfil de rol FUNCIONARIO. El estado activo vive solo en usuario.activo';

drop trigger if exists trg_funcionario_actualizado_en on public.funcionario;
create trigger trg_funcionario_actualizado_en before update on public.funcionario
  for each row execute function public.fn_set_actualizado_en();

create table if not exists public.consentimiento_datos (
  id                          uuid primary key default gen_random_uuid(),
  usuario_id                  uuid not null references public.usuario(id) on delete cascade,
  version_texto               integer not null,
  aceptado_en                 timestamptz not null default now(),
  ip                          text,
  es_menor_al_aceptar         boolean not null default false,
  acudiente_nombre            text,
  acudiente_tipo_documento    text,
  acudiente_numero_documento  text,
  acudiente_correo            text
);
comment on table public.consentimiento_datos is 'Registro inmutable de aceptacion del tratamiento de datos (Ley 1581)';
create index if not exists ix_consentimiento_usuario on public.consentimiento_datos (usuario_id, aceptado_en desc);

drop trigger if exists trg_consentimiento_inmutable on public.consentimiento_datos;
create trigger trg_consentimiento_inmutable before update or delete on public.consentimiento_datos
  for each row execute function public.fn_bloquear_modificacion();

-- -----------------------------------------------------------------------------
-- 6. Catalogo de beneficios (DECISIONES section 6) y convocatorias (convocatorias.md)
-- -----------------------------------------------------------------------------
create table if not exists public.beneficio (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique check (codigo in ('S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6')),
  nombre       text not null,
  categoria    public.categoria_beneficio not null,
  descripcion  text not null default '',
  activo       boolean not null default true
);

insert into public.beneficio (codigo, nombre, categoria, descripcion) values
  ('S11', 'Saber 11',                      'ESPECIAL',   'Reconocimiento economico a los mejores puntajes del examen de Estado de estudiantes de Tocancipa'),
  ('EA',  'Excelencia Academica',          'ESPECIAL',   'Estimulo para estudiantes con promedios sobresalientes en educacion superior'),
  ('DEP', 'Deporte',                       'ESPECIAL',   'Estimulo para deportistas destacados de rendimiento municipal, departamental o nacional'),
  ('CUL', 'Cultura',                       'ESPECIAL',   'Estimulo para talentos artisticos y culturales del municipio'),
  ('SUP', 'Matricula Educacion Superior',  'MATRICULA',  'Apoyo a la matricula en instituciones de educacion superior'),
  ('ST',  'Subsidio de Transporte',        'TRANSPORTE', 'Apoyo economico para desplazamiento hacia sedes fuera del municipio'),
  ('LE1', 'Linea Especial 1',              'ESPECIAL',   'Apoyo focalizado segun Acuerdo 023 de 2025 (poblacion objetivo por validar)'),
  ('LE2', 'Linea Especial 2',              'ESPECIAL',   'Apoyo focalizado segun Acuerdo 023 de 2025 (poblacion objetivo por validar)'),
  ('LE3', 'Linea Especial 3',              'ESPECIAL',   'Apoyo focalizado segun Acuerdo 023 de 2025 (poblacion objetivo por validar)'),
  ('LE4', 'Linea Especial 4',              'ESPECIAL',   'Apoyo focalizado segun Acuerdo 023 de 2025 (poblacion objetivo por validar)'),
  ('LE5', 'Linea Especial 5',              'ESPECIAL',   'Apoyo focalizado segun Acuerdo 023 de 2025 (poblacion objetivo por validar)'),
  ('LE6', 'Linea Especial 6',              'ESPECIAL',   'Apoyo focalizado segun Acuerdo 023 de 2025 (poblacion objetivo por validar)')
on conflict (codigo) do nothing;

create table if not exists public.convocatoria (
  id                               uuid primary key default gen_random_uuid(),
  anio                             integer not null check (anio between 2024 and 2100),
  semestre                         smallint not null check (semestre in (1, 2)),
  nombre                           text not null,
  descripcion                      text not null default '',
  fecha_apertura                   timestamptz not null,
  fecha_cierre_exclusiva           timestamptz not null,
  estado                           public.estado_convocatoria not null default 'BORRADOR',
  motivo_suspension                text,
  recordatorio_cierre_enviado_en   timestamptz,
  version                          integer not null default 0,
  creado_por                       uuid references public.usuario(id),
  creado_en                        timestamptz not null default now(),
  actualizado_en                   timestamptz not null default now(),
  constraint uq_convocatoria_periodo unique (anio, semestre),
  constraint ck_convocatoria_fechas check (fecha_cierre_exclusiva > fecha_apertura)
);
comment on column public.convocatoria.fecha_cierre_exclusiva is 'Instante 00:00 America/Bogota del dia siguiente al cierre presentado (23:59:59)';
create index if not exists ix_convocatoria_estado on public.convocatoria (estado, fecha_apertura, fecha_cierre_exclusiva);

drop trigger if exists trg_convocatoria_actualizado_en on public.convocatoria;
create trigger trg_convocatoria_actualizado_en before update on public.convocatoria
  for each row execute function public.fn_set_actualizado_en();

create table if not exists public.convocatoria_beneficio (
  convocatoria_id          uuid not null references public.convocatoria(id) on delete cascade,
  beneficio_id             uuid not null references public.beneficio(id),
  cupos_estimados          integer not null default 0 check (cupos_estimados >= 0),
  presupuesto_asignado     numeric(16,2) not null default 0 check (presupuesto_asignado >= 0),
  valor_apoyo_referencial  numeric(16,2) not null default 0 check (valor_apoyo_referencial >= 0),
  primary key (convocatoria_id, beneficio_id)
);

create table if not exists public.ampliacion_convocatoria (
  id                      uuid primary key default gen_random_uuid(),
  convocatoria_id         uuid not null references public.convocatoria(id) on delete cascade,
  tipo                    public.tipo_ampliacion not null,
  fecha_cierre_anterior   timestamptz not null,
  fecha_cierre_nueva      timestamptz not null,
  estado_anterior         public.estado_convocatoria not null,
  admin_id                uuid references public.usuario(id),
  motivo                  text not null check (char_length(motivo) >= 15),
  fecha_ampliacion        timestamptz not null default now()
);
create index if not exists ix_ampliacion_convocatoria on public.ampliacion_convocatoria (convocatoria_id, fecha_ampliacion desc);

create table if not exists public.convocatoria_cambio_estado (
  id               uuid primary key default gen_random_uuid(),
  convocatoria_id  uuid not null references public.convocatoria(id) on delete cascade,
  estado_desde     public.estado_convocatoria,
  estado_hasta     public.estado_convocatoria not null,
  origen           public.origen_cambio_estado not null default 'ADMIN',
  actor_id         uuid references public.usuario(id),
  registrado_en    timestamptz not null default now()
);
create index if not exists ix_convocatoria_cambio_estado on public.convocatoria_cambio_estado (convocatoria_id, registrado_en desc);

-- Comite de la convocatoria. funcionario_id = usuario.id (rol FUNCIONARIO).
create table if not exists public.asignacion_funcionario (
  id               uuid primary key default gen_random_uuid(),
  convocatoria_id  uuid not null references public.convocatoria(id) on delete cascade,
  funcionario_id   uuid not null references public.usuario(id),
  asignado_en      timestamptz not null default now(),
  asignado_por     uuid references public.usuario(id),
  retirado_en      timestamptz
);
create unique index if not exists uq_asignacion_funcionario_activa
  on public.asignacion_funcionario (convocatoria_id, funcionario_id) where retirado_en is null;
create index if not exists ix_asignacion_funcionario_func on public.asignacion_funcionario (funcionario_id) where retirado_en is null;

-- -----------------------------------------------------------------------------
-- 7. Postulaciones (postulaciones.md)
-- -----------------------------------------------------------------------------
create table if not exists public.postulacion (
  id                         uuid primary key default gen_random_uuid(),
  beneficiario_id            uuid not null references public.beneficiario(id),
  convocatoria_id            uuid not null references public.convocatoria(id),
  tipo_solicitud             public.tipo_solicitud not null,
  estado                     public.estado_postulacion not null default 'BORRADOR',
  datos_formulario           jsonb not null default '{}'::jsonb,
  correcciones_perfil        jsonb,
  correccion_vigente         jsonb,
  valor_matricula_letras     text,
  ciclo                      integer not null default 0 check (ciclo >= 0),
  version                    integer not null default 0,
  aprobacion_parcial         boolean not null default false,
  fecha_limite_subsanacion   timestamptz,
  enviada_en                 timestamptz,
  creado_en                  timestamptz not null default now(),
  actualizado_en             timestamptz not null default now(),
  constraint uq_postulacion_beneficiario_convocatoria unique (beneficiario_id, convocatoria_id)
);
create index if not exists ix_postulacion_convocatoria_estado on public.postulacion (convocatoria_id, estado);
create index if not exists ix_postulacion_beneficiario on public.postulacion (beneficiario_id);
create index if not exists ix_postulacion_subsanacion on public.postulacion (fecha_limite_subsanacion) where estado = 'EN_CORRECCION';

drop trigger if exists trg_postulacion_actualizado_en on public.postulacion;
create trigger trg_postulacion_actualizado_en before update on public.postulacion
  for each row execute function public.fn_set_actualizado_en();

-- Estados terminales: ninguna transicion sale de APROBADA, RECHAZADA o DESISTIDA (DECISIONES section 4).
create or replace function public.fn_postulacion_estado_terminal()
returns trigger
language plpgsql
as $$
begin
  if old.estado in ('APROBADA', 'RECHAZADA', 'DESISTIDA') and new.estado is distinct from old.estado then
    raise exception 'TRANSICION_INVALIDA: la postulacion % esta en estado terminal %', old.id, old.estado
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_postulacion_estado_terminal on public.postulacion;
create trigger trg_postulacion_estado_terminal before update of estado on public.postulacion
  for each row execute function public.fn_postulacion_estado_terminal();

-- Un registro inmutable por ciclo de envio.
create table if not exists public.postulacion_envio (
  id                uuid primary key default gen_random_uuid(),
  postulacion_id    uuid not null references public.postulacion(id) on delete cascade,
  ciclo             integer not null check (ciclo >= 1),
  datos_formulario  jsonb not null,
  perfil_snapshot   jsonb not null,
  hash_envio        text not null,
  idempotency_key   text,
  enviado_en        timestamptz not null default now(),
  constraint uq_postulacion_envio_ciclo unique (postulacion_id, ciclo)
);
create unique index if not exists uq_postulacion_envio_idempotencia
  on public.postulacion_envio (postulacion_id, idempotency_key) where idempotency_key is not null;

drop trigger if exists trg_postulacion_envio_inmutable on public.postulacion_envio;
create trigger trg_postulacion_envio_inmutable before update or delete on public.postulacion_envio
  for each row execute function public.fn_bloquear_modificacion();

create table if not exists public.postulacion_beneficio (
  postulacion_id    uuid not null references public.postulacion(id) on delete cascade,
  beneficio_codigo  text not null references public.beneficio(codigo),
  primary key (postulacion_id, beneficio_codigo)
);

create table if not exists public.historial_estado_postulacion (
  id               uuid primary key default gen_random_uuid(),
  postulacion_id   uuid not null references public.postulacion(id) on delete cascade,
  ciclo            integer not null default 0,
  estado_anterior  public.estado_postulacion,
  estado_nuevo     public.estado_postulacion not null,
  motivo           text not null,
  actor_tipo       public.actor_tipo not null,
  actor_id         uuid references public.usuario(id),
  observaciones    text,
  cambiado_en      timestamptz not null default now()
);
comment on column public.historial_estado_postulacion.actor_id is 'Nunca se expone al beneficiario (anonimato del evaluador)';
create index if not exists ix_historial_postulacion on public.historial_estado_postulacion (postulacion_id, cambiado_en);

-- -----------------------------------------------------------------------------
-- 8. Catalogos y configuracion (catalogos_configuracion.md)
-- -----------------------------------------------------------------------------
create table if not exists public.declaracion_juramentada (
  id                         uuid primary key default gen_random_uuid(),
  codigo                     text not null check (codigo ~ '^DECL_[1-6]$'),
  version                    integer not null check (version >= 1),
  titulo                     text not null,
  texto                      text not null,
  vigente                    boolean not null default true,
  texto_oficial_confirmado   boolean not null default false,
  vigente_desde              date not null default current_date,
  creado_por                 uuid references public.usuario(id),
  creado_en                  timestamptz not null default now(),
  constraint uq_declaracion_codigo_version unique (codigo, version)
);
create unique index if not exists uq_declaracion_vigente on public.declaracion_juramentada (codigo) where vigente;

-- Seed: 6 declaraciones PROVISIONALES (texto oficial del GE-F041 pendiente; PENDIENTES.md #5)
insert into public.declaracion_juramentada (codigo, version, titulo, texto, vigente, texto_oficial_confirmado)
select c, 1, 'Declaracion juramentada ' || right(c, 1),
       'PROVISIONAL - Texto pendiente de cargar desde el formato oficial GE-F041 (declaracion ' || right(c, 1) || ').',
       true, false
from unnest(array['DECL_1','DECL_2','DECL_3','DECL_4','DECL_5','DECL_6']) as c
on conflict (codigo, version) do nothing;

create table if not exists public.configuracion_sistema (
  id                   uuid primary key default gen_random_uuid(),
  clave                text not null unique,
  valor                text,
  tipo                 text not null check (tipo in ('INT','STRING','BOOL','TEXT','DATE','JSON')),
  categoria            text not null check (categoria in ('ACUERDO','DOCUMENTOS','PLAZOS','ALERTAS','SEGURIDAD','PRIVACIDAD','JURIDICO','LABOR_SOCIAL','NOTIFICACIONES')),
  descripcion          text not null default '',
  valor_defecto        text,
  valor_min            text,
  valor_max            text,
  pendiente_confirmar  boolean not null default false,
  version              integer not null default 0,
  actualizado_por      uuid references public.usuario(id),
  actualizado_en       timestamptz not null default now()
);

-- Seed de claves con valores por defecto (catalogos_configuracion.md). No sobrescribe valores ya editados.
insert into public.configuracion_sistema (clave, valor, tipo, categoria, descripcion, valor_defecto, valor_min, valor_max, pendiente_confirmar) values
  ('ACUERDO_VIGENTE_CODIGO', 'ACUERDO-023-2025', 'STRING', 'ACUERDO', 'Codigo del acuerdo aplicable (impreso en formatos)', 'ACUERDO-023-2025', null, null, true),
  ('ACUERDO_VIGENTE_TEXTO', 'Acuerdo Municipal 023 de 2025', 'TEXT', 'ACUERDO', 'Texto de referencia estampado en los PDF', 'Acuerdo Municipal 023 de 2025', null, null, false),
  ('MAX_TAMANO_ARCHIVO_MB', '10', 'INT', 'DOCUMENTOS', 'Tope por archivo (no puede exceder 10)', '10', '1', '10', false),
  ('CUOTA_POSTULACION_MB', '30', 'INT', 'DOCUMENTOS', 'Cuota total de soportes por postulacion', '30', '10', '200', false),
  ('SUBSANACION_DIAS_HABILES', '5', 'INT', 'PLAZOS', 'Plazo por defecto de subsanacion (dias habiles)', '5', '1', '15', false),
  ('SUBSANACION_DIAS_HABILES_MAX', '15', 'INT', 'PLAZOS', 'Maximo que el funcionario puede fijar al emitir CORRECCION', '15', '1', '30', false),
  ('ALERTA_CIERRE_DIAS', '7', 'INT', 'ALERTAS', 'Dias naturales antes del cierre para alertar y recordar', '7', '1', '30', false),
  ('ALERTA_SOBRECARGA_PENDIENTES', '50', 'INT', 'ALERTAS', 'Postulaciones PENDIENTE acumuladas para considerar sobrecarga', '50', '1', '1000', false),
  ('ALERTA_SOBRECARGA_DIAS_HABILES', '5', 'INT', 'ALERTAS', 'Dias habiles sin revisiones para marcar cuello de botella', '5', '1', '30', false),
  ('ALERTA_ASIGNACION_SIN_MOVIMIENTO_DIAS_HABILES', '5', 'INT', 'ALERTAS', 'Dias habiles sin movimiento en una asignacion ACTIVA antes de alertar', '5', '1', '60', true),
  ('KANON_UMBRAL', '5', 'INT', 'PRIVACIDAD', 'Umbral de k-anonimato en dashboards', '5', '2', '50', false),
  ('SESIONES_MAX', '3', 'INT', 'SEGURIDAD', 'Sesiones activas por usuario', '3', '1', '10', false),
  ('RECORDATORIO_BORRADOR_DIAS', '5', 'INT', 'PLAZOS', 'Dias antes del cierre para recordar al beneficiario con borrador', '5', '1', '30', false),
  ('RECORDATORIO_SUBSANACION_DIAS_HABILES', '2', 'INT', 'PLAZOS', 'Dias habiles antes de fecha_limite_subsanacion para avisar', '2', '1', '5', false),
  ('FECHA_PROXIMA_APERTURA_ESTIMADA', null, 'DATE', 'PLAZOS', 'Fecha estimada mostrada cuando no hay convocatoria abierta', null, null, null, false),
  ('CONSENTIMIENTO_TEXTO_VERSION_VIGENTE', '1', 'INT', 'PRIVACIDAD', 'Version vigente del consentimiento; solo cambia publicando una version', '1', '1', null, false),
  ('PAGARE_REQUIERE_CODEUDOR_MENORES', 'true', 'BOOL', 'JURIDICO', 'Activa el bloque de codeudor/acudiente en GE-F043 para menores', 'true', null, null, true),
  ('RETENCION_DOCUMENTOS_ANIOS', '5', 'INT', 'JURIDICO', 'Retencion de documentos eliminados logicamente', '5', '1', '30', true),
  ('RETENCION_AUDITORIA_ANIOS', '10', 'INT', 'JURIDICO', 'Retencion de auditoria_evento', '10', '1', '30', true),
  ('RETENCION_NOTIFICACIONES_MESES', '24', 'INT', 'PRIVACIDAD', 'Retencion de notificaciones y entregas de correo', '24', '3', '120', false),
  ('LABOR_SOCIAL_HORAS_MINIMAS', '0', 'INT', 'LABOR_SOCIAL', 'Horas minimas exigidas por periodo (sin definir)', '0', '0', '1000', true),
  ('AMPLIACION_MOTIVO_MIN_CARACTERES', '15', 'INT', 'PLAZOS', 'Longitud minima del motivo de ampliacion/suspension', '15', '10', '200', false),
  ('PERFIL_EDAD_MAYORIA', '18', 'INT', 'JURIDICO', 'Edad de mayoria para derivar es_menor', '18', '18', '18', false),
  ('REGISTRO_VERIFICACION_EMAIL_HORAS', '48', 'INT', 'SEGURIDAD', 'Vigencia del enlace de verificacion de correo', '48', '1', '168', false),
  ('NOTIF_REINTENTOS_MAX', '8', 'INT', 'NOTIFICACIONES', 'Reintentos del worker de correo', '8', '1', '20', false)
on conflict (clave) do nothing;

create table if not exists public.festivo (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null unique,
  nombre      text not null,
  anio        integer not null,
  creado_por  uuid references public.usuario(id),
  creado_en   timestamptz not null default now()
);
create index if not exists ix_festivo_anio on public.festivo (anio);

-- Seed festivos Colombia 2026 (Ley 51 de 1983 / Ley Emiliani)
insert into public.festivo (fecha, nombre, anio) values
  ('2026-01-01', 'Ano Nuevo', 2026),
  ('2026-01-12', 'Dia de los Reyes Magos', 2026),
  ('2026-03-23', 'Dia de San Jose', 2026),
  ('2026-04-02', 'Jueves Santo', 2026),
  ('2026-04-03', 'Viernes Santo', 2026),
  ('2026-05-01', 'Dia del Trabajo', 2026),
  ('2026-05-18', 'Ascension del Senor', 2026),
  ('2026-06-08', 'Corpus Christi', 2026),
  ('2026-06-15', 'Sagrado Corazon de Jesus', 2026),
  ('2026-06-29', 'San Pedro y San Pablo', 2026),
  ('2026-07-20', 'Dia de la Independencia', 2026),
  ('2026-08-07', 'Batalla de Boyaca', 2026),
  ('2026-08-17', 'Asuncion de la Virgen', 2026),
  ('2026-10-12', 'Dia de la Raza', 2026),
  ('2026-11-02', 'Todos los Santos', 2026),
  ('2026-11-16', 'Independencia de Cartagena', 2026),
  ('2026-12-08', 'Inmaculada Concepcion', 2026),
  ('2026-12-25', 'Navidad', 2026)
on conflict (fecha) do nothing;

-- -----------------------------------------------------------------------------
-- 9. Notificaciones (notificaciones.md) - buzon in-app para cualquier usuario
-- -----------------------------------------------------------------------------
create table if not exists public.notificacion (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.usuario(id) on delete cascade,
  tipo         text not null,
  titulo       text not null,
  mensaje      text not null,
  entidad      text,
  entidad_id   text,
  url_destino  text,
  severidad    public.severidad_notificacion not null default 'INFO',
  leida        boolean not null default false,
  leida_en     timestamptz,
  clave_dedup  text,
  creada_en    timestamptz not null default now()
);
create index if not exists ix_notificacion_usuario on public.notificacion (usuario_id, leida, creada_en desc);
create unique index if not exists uq_notificacion_dedup on public.notificacion (usuario_id, clave_dedup) where clave_dedup is not null;

-- -----------------------------------------------------------------------------
-- 10. Auditoria append-only (auditoria.md)
-- -----------------------------------------------------------------------------
create table if not exists public.auditoria_evento (
  id             uuid primary key default gen_random_uuid(),
  secuencia      bigserial unique,
  actor_id       uuid,
  actor_tipo     text not null default 'USUARIO' check (actor_tipo in ('USUARIO','SISTEMA','ANONIMO')),
  actor_rol      text check (actor_rol is null or actor_rol in ('ADMINISTRADOR','FUNCIONARIO','BENEFICIARIO')),
  accion         text not null,
  entidad        text not null,
  entidad_id     text,
  resultado      text not null default 'EXITO' check (resultado in ('EXITO','FALLO','DENEGADO')),
  datos_antes    jsonb,
  datos_despues  jsonb,
  metadatos      jsonb not null default '{}'::jsonb,
  request_id     text,
  sesion_id      text,
  ip_origen      text,
  user_agent     text,
  hash_previo    text,
  hash_evento    text,
  registrado_en  timestamptz not null default now()
);
comment on table public.auditoria_evento is 'Bitacora append-only. Sin UPDATE/DELETE (REVOKE + trigger). actor_id sin FK para conservar eventos de cuentas eliminadas.';
create index if not exists ix_auditoria_entidad on public.auditoria_evento (entidad, entidad_id, registrado_en desc);
create index if not exists ix_auditoria_actor on public.auditoria_evento (actor_id, registrado_en desc);
create index if not exists ix_auditoria_accion on public.auditoria_evento (accion, registrado_en desc);
create index if not exists ix_auditoria_registrado on public.auditoria_evento (registrado_en desc);
create index if not exists ix_auditoria_request on public.auditoria_evento (request_id);

drop trigger if exists trg_auditoria_inmutable on public.auditoria_evento;
create trigger trg_auditoria_inmutable before update or delete on public.auditoria_evento
  for each row execute function public.fn_bloquear_modificacion();

revoke update, delete, truncate on public.auditoria_evento from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 11. Metricas: vistas materializadas (dashboard_funcionario.md)
--
-- NOTA: las tablas `revision` y `revision_beneficio` pertenecen al modulo
-- `evaluacion` (P2) y aun no existen. Estas vistas se crean con las MISMAS
-- columnas que define dashboard_funcionario.md, dejando en NULL/SIN_DECISION lo
-- que proviene de revision. La migracion del modulo evaluacion debe hacer
-- DROP MATERIALIZED VIEW y recrearlas con los LEFT JOIN a revision/revision_beneficio.
-- -----------------------------------------------------------------------------
create table if not exists public.metricas_refresh (
  vista          text primary key,
  refrescada_en  timestamptz not null,
  duracion_ms    integer not null,
  estado         text not null check (estado in ('OK','ERROR')),
  error          text
);

do $$ begin
  if not exists (select 1 from pg_matviews where schemaname = 'public' and matviewname = 'mv_postulacion_envio') then
    create materialized view public.mv_postulacion_envio as
    select
      pe.postulacion_id,
      pe.ciclo,
      p.convocatoria_id,
      p.tipo_solicitud::text                                       as tipo_solicitud,
      p.estado::text                                               as estado_actual,
      (pe.ciclo = p.ciclo)                                         as es_ciclo_actual,
      p.aprobacion_parcial,
      null::text                                                   as resultado_ciclo,   -- APROBAR | RECHAZAR | CORRECCION (modulo evaluacion)
      pe.enviado_en,
      (pe.enviado_en at time zone 'America/Bogota')::date          as dia_envio,
      null::timestamptz                                            as decidida_en,
      null::numeric(12,2)                                          as horas_dictamen
    from public.postulacion_envio pe
    join public.postulacion p on p.id = pe.postulacion_id
    where p.estado <> 'BORRADOR'
    with data;
  end if;
end $$;

create unique index if not exists ux_mv_postulacion_envio on public.mv_postulacion_envio (postulacion_id, ciclo);
create index if not exists ix_mv_envio_convocatoria on public.mv_postulacion_envio (convocatoria_id, es_ciclo_actual, estado_actual);
create index if not exists ix_mv_envio_dia on public.mv_postulacion_envio (convocatoria_id, dia_envio);

do $$ begin
  if not exists (select 1 from pg_matviews where schemaname = 'public' and matviewname = 'mv_postulacion_beneficio') then
    create materialized view public.mv_postulacion_beneficio as
    select
      pb.postulacion_id,
      pb.beneficio_codigo,
      p.convocatoria_id,
      p.tipo_solicitud::text                                       as tipo_solicitud,
      p.estado::text                                               as estado_actual,
      'SIN_DECISION'::text                                         as decision_beneficio, -- APROBADO | RECHAZADO | SIN_DECISION (modulo evaluacion)
      (pe.enviado_en at time zone 'America/Bogota')::date          as dia_envio
    from public.postulacion_beneficio pb
    join public.postulacion p        on p.id = pb.postulacion_id
    join public.postulacion_envio pe on pe.postulacion_id = p.id and pe.ciclo = p.ciclo
    where p.estado <> 'BORRADOR'
    with data;
  end if;
end $$;

create unique index if not exists ux_mv_postulacion_beneficio on public.mv_postulacion_beneficio (postulacion_id, beneficio_codigo);
create index if not exists ix_mv_beneficio_convocatoria on public.mv_postulacion_beneficio (convocatoria_id, beneficio_codigo);

-- Las vistas materializadas no soportan RLS: se restringe su lectura a service_role.
revoke all on public.mv_postulacion_envio from anon, authenticated;
revoke all on public.mv_postulacion_beneficio from anon, authenticated;

-- Refresco (lo invoca el job de la API con service_role; CONCURRENTLY requiere los indices unicos anteriores)
create or replace function public.fn_refrescar_metricas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t0 timestamptz;
begin
  t0 := clock_timestamp();
  begin
    refresh materialized view concurrently public.mv_postulacion_envio;
    insert into public.metricas_refresh (vista, refrescada_en, duracion_ms, estado, error)
    values ('mv_postulacion_envio', now(), (extract(epoch from clock_timestamp() - t0) * 1000)::int, 'OK', null)
    on conflict (vista) do update set refrescada_en = excluded.refrescada_en, duracion_ms = excluded.duracion_ms, estado = 'OK', error = null;
  exception when others then
    insert into public.metricas_refresh (vista, refrescada_en, duracion_ms, estado, error)
    values ('mv_postulacion_envio', now(), 0, 'ERROR', sqlerrm)
    on conflict (vista) do update set estado = 'ERROR', error = excluded.error;
  end;
  t0 := clock_timestamp();
  begin
    refresh materialized view concurrently public.mv_postulacion_beneficio;
    insert into public.metricas_refresh (vista, refrescada_en, duracion_ms, estado, error)
    values ('mv_postulacion_beneficio', now(), (extract(epoch from clock_timestamp() - t0) * 1000)::int, 'OK', null)
    on conflict (vista) do update set refrescada_en = excluded.refrescada_en, duracion_ms = excluded.duracion_ms, estado = 'OK', error = null;
  exception when others then
    insert into public.metricas_refresh (vista, refrescada_en, duracion_ms, estado, error)
    values ('mv_postulacion_beneficio', now(), 0, 'ERROR', sqlerrm)
    on conflict (vista) do update set estado = 'ERROR', error = excluded.error;
  end;
end;
$$;
revoke all on function public.fn_refrescar_metricas() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 12. Helpers de alcance para RLS (SECURITY DEFINER para evitar recursion de politicas)
-- -----------------------------------------------------------------------------

-- El beneficiario (fila de public.beneficiario) pertenece al usuario autenticado
create or replace function public.es_mi_beneficiario(p_beneficiario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.beneficiario b
    where b.id = p_beneficiario_id and b.usuario_id = auth.uid()
  );
$$;

-- El funcionario autenticado pertenece (o pertenecio) al comite de la convocatoria
create or replace function public.en_comite(p_convocatoria_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.asignacion_funcionario af
    where af.convocatoria_id = p_convocatoria_id and af.funcionario_id = auth.uid()
  );
$$;

-- La postulacion es propia (beneficiario) o de una convocatoria del comite (funcionario)
create or replace function public.puede_leer_postulacion(p_postulacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.postulacion p
    where p.id = p_postulacion_id
      and (
        (public.es_beneficiario() and public.es_mi_beneficiario(p.beneficiario_id))
        or (public.es_funcionario() and public.en_comite(p.convocatoria_id))
        or public.es_administrador()
      )
  );
$$;

-- Estado de RLS por tabla (para scripts/verify-supabase.ts)
create or replace function public.fn_estado_rls()
returns table (tabla text, rls boolean, forzado boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by 1;
$$;
revoke all on function public.fn_estado_rls() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 13. RLS: activo en todas las tablas. service_role omite RLS (escrituras de sistema).
--     Principio: beneficiario ve/edita lo propio; funcionario lee lo de sus
--     convocatorias asignadas; administrador lee todo. Las escrituras de negocio
--     las hace la API (service_role) tras requirePermission + alcance.
-- -----------------------------------------------------------------------------
alter table public.rol                          enable row level security;
alter table public.permiso                      enable row level security;
alter table public.rol_permiso                  enable row level security;
alter table public.usuario                      enable row level security;
alter table public.beneficiario                 enable row level security;
alter table public.acudiente                    enable row level security;
alter table public.funcionario                  enable row level security;
alter table public.consentimiento_datos         enable row level security;
alter table public.beneficio                    enable row level security;
alter table public.convocatoria                 enable row level security;
alter table public.convocatoria_beneficio       enable row level security;
alter table public.ampliacion_convocatoria      enable row level security;
alter table public.convocatoria_cambio_estado   enable row level security;
alter table public.asignacion_funcionario       enable row level security;
alter table public.postulacion                  enable row level security;
alter table public.postulacion_envio            enable row level security;
alter table public.postulacion_beneficio        enable row level security;
alter table public.historial_estado_postulacion enable row level security;
alter table public.declaracion_juramentada      enable row level security;
alter table public.configuracion_sistema        enable row level security;
alter table public.festivo                      enable row level security;
alter table public.notificacion                 enable row level security;
alter table public.auditoria_evento             enable row level security;
alter table public.metricas_refresh             enable row level security;

-- Catalogos de solo lectura para cualquier usuario autenticado
drop policy if exists rol_select on public.rol;
create policy rol_select on public.rol for select to authenticated using (true);
drop policy if exists permiso_select on public.permiso;
create policy permiso_select on public.permiso for select to authenticated using (true);
drop policy if exists rol_permiso_select on public.rol_permiso;
create policy rol_permiso_select on public.rol_permiso for select to authenticated using (true);
drop policy if exists beneficio_select on public.beneficio;
create policy beneficio_select on public.beneficio for select to anon, authenticated using (activo);
drop policy if exists declaracion_select on public.declaracion_juramentada;
create policy declaracion_select on public.declaracion_juramentada for select to authenticated using (true);
drop policy if exists festivo_select on public.festivo;
create policy festivo_select on public.festivo for select to authenticated using (true);

-- usuario: cada quien se ve; administrador ve todos
drop policy if exists usuario_select_propio on public.usuario;
create policy usuario_select_propio on public.usuario for select to authenticated
  using (id = auth.uid() or public.es_administrador());

-- beneficiario: titular ve/edita lo propio; admin lee todo; funcionario lee los de postulaciones de su comite
drop policy if exists beneficiario_select on public.beneficiario;
create policy beneficiario_select on public.beneficiario for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.es_administrador()
    or (public.es_funcionario() and exists (
          select 1 from public.postulacion p
          where p.beneficiario_id = beneficiario.id and public.en_comite(p.convocatoria_id)))
  );
drop policy if exists beneficiario_update_propio on public.beneficiario;
create policy beneficiario_update_propio on public.beneficiario for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists beneficiario_insert_propio on public.beneficiario;
create policy beneficiario_insert_propio on public.beneficiario for insert to authenticated
  with check (usuario_id = auth.uid() and public.es_beneficiario());

-- acudiente: sigue al beneficiario
drop policy if exists acudiente_select on public.acudiente;
create policy acudiente_select on public.acudiente for select to authenticated
  using (public.es_mi_beneficiario(beneficiario_id) or public.es_administrador()
         or (public.es_funcionario() and exists (
              select 1 from public.postulacion p
              where p.beneficiario_id = acudiente.beneficiario_id and public.en_comite(p.convocatoria_id))));
drop policy if exists acudiente_modificar_propio on public.acudiente;
create policy acudiente_modificar_propio on public.acudiente for all to authenticated
  using (public.es_mi_beneficiario(beneficiario_id)) with check (public.es_mi_beneficiario(beneficiario_id));

-- funcionario: el propio, el administrador, o cualquier funcionario (para ver companeros del comite)
drop policy if exists funcionario_select on public.funcionario;
create policy funcionario_select on public.funcionario for select to authenticated
  using (usuario_id = auth.uid() or public.es_administrador() or public.es_funcionario());

-- consentimiento: propio (lectura e insercion); admin lee todo
drop policy if exists consentimiento_select on public.consentimiento_datos;
create policy consentimiento_select on public.consentimiento_datos for select to authenticated
  using (usuario_id = auth.uid() or public.es_administrador());
drop policy if exists consentimiento_insert on public.consentimiento_datos;
create policy consentimiento_insert on public.consentimiento_datos for insert to authenticated
  with check (usuario_id = auth.uid());

-- convocatoria: publico/beneficiario ve abiertas; funcionario las de su comite; admin todas
drop policy if exists convocatoria_select on public.convocatoria;
create policy convocatoria_select on public.convocatoria for select to anon, authenticated
  using (
    (estado = 'HABILITADA' and fecha_apertura <= now() and now() < fecha_cierre_exclusiva)
    or public.es_administrador()
    or (public.es_funcionario() and public.en_comite(id))
  );
drop policy if exists convocatoria_beneficio_select on public.convocatoria_beneficio;
create policy convocatoria_beneficio_select on public.convocatoria_beneficio for select to anon, authenticated
  using (exists (select 1 from public.convocatoria c where c.id = convocatoria_id));
drop policy if exists ampliacion_select on public.ampliacion_convocatoria;
create policy ampliacion_select on public.ampliacion_convocatoria for select to authenticated
  using (public.es_administrador() or (public.es_funcionario() and public.en_comite(convocatoria_id)));
drop policy if exists cambio_estado_select on public.convocatoria_cambio_estado;
create policy cambio_estado_select on public.convocatoria_cambio_estado for select to authenticated
  using (public.es_administrador() or (public.es_funcionario() and public.en_comite(convocatoria_id)));
drop policy if exists asignacion_funcionario_select on public.asignacion_funcionario;
create policy asignacion_funcionario_select on public.asignacion_funcionario for select to authenticated
  using (public.es_administrador() or funcionario_id = auth.uid());

-- postulacion: beneficiario propia (lee y edita); funcionario lee las de su comite; admin lee todo
drop policy if exists postulacion_select on public.postulacion;
create policy postulacion_select on public.postulacion for select to authenticated
  using (
    (public.es_beneficiario() and public.es_mi_beneficiario(beneficiario_id))
    or (public.es_funcionario() and public.en_comite(convocatoria_id))
    or public.es_administrador()
  );
drop policy if exists postulacion_insert_propia on public.postulacion;
create policy postulacion_insert_propia on public.postulacion for insert to authenticated
  with check (public.es_beneficiario() and public.es_mi_beneficiario(beneficiario_id));
drop policy if exists postulacion_update_propia on public.postulacion;
create policy postulacion_update_propia on public.postulacion for update to authenticated
  using (public.es_beneficiario() and public.es_mi_beneficiario(beneficiario_id) and estado in ('BORRADOR', 'EN_CORRECCION'))
  with check (public.es_beneficiario() and public.es_mi_beneficiario(beneficiario_id));
drop policy if exists postulacion_delete_borrador on public.postulacion;
create policy postulacion_delete_borrador on public.postulacion for delete to authenticated
  using (public.es_beneficiario() and public.es_mi_beneficiario(beneficiario_id) and estado = 'BORRADOR');

drop policy if exists postulacion_envio_select on public.postulacion_envio;
create policy postulacion_envio_select on public.postulacion_envio for select to authenticated
  using (public.puede_leer_postulacion(postulacion_id));
drop policy if exists postulacion_beneficio_select on public.postulacion_beneficio;
create policy postulacion_beneficio_select on public.postulacion_beneficio for select to authenticated
  using (public.puede_leer_postulacion(postulacion_id));
drop policy if exists postulacion_beneficio_modificar on public.postulacion_beneficio;
create policy postulacion_beneficio_modificar on public.postulacion_beneficio for all to authenticated
  using (public.es_beneficiario() and exists (
           select 1 from public.postulacion p
           where p.id = postulacion_id and public.es_mi_beneficiario(p.beneficiario_id) and p.estado = 'BORRADOR'))
  with check (public.es_beneficiario() and exists (
           select 1 from public.postulacion p
           where p.id = postulacion_id and public.es_mi_beneficiario(p.beneficiario_id) and p.estado = 'BORRADOR'));
drop policy if exists historial_select on public.historial_estado_postulacion;
create policy historial_select on public.historial_estado_postulacion for select to authenticated
  using (public.puede_leer_postulacion(postulacion_id));
-- NOTA: el beneficiario NO debe recibir actor_id/actor_tipo del historial; la API lo serializa (ObservacionPublica).

-- configuracion: administrador lee todo; funcionario lee lo no sensible (categorias operativas)
drop policy if exists configuracion_select on public.configuracion_sistema;
create policy configuracion_select on public.configuracion_sistema for select to authenticated
  using (public.es_administrador() or (public.es_funcionario() and categoria in ('ACUERDO','DOCUMENTOS','PLAZOS','ALERTAS')));

-- notificacion: solo las propias (lectura y marcar leida)
drop policy if exists notificacion_select_propia on public.notificacion;
create policy notificacion_select_propia on public.notificacion for select to authenticated
  using (usuario_id = auth.uid());
drop policy if exists notificacion_update_propia on public.notificacion;
create policy notificacion_update_propia on public.notificacion for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- auditoria: solo administrador lee; nadie (salvo service_role) inserta directamente
drop policy if exists auditoria_select_admin on public.auditoria_evento;
create policy auditoria_select_admin on public.auditoria_evento for select to authenticated
  using (public.es_administrador());

-- metricas_refresh: lectura para staff
drop policy if exists metricas_refresh_select on public.metricas_refresh;
create policy metricas_refresh_select on public.metricas_refresh for select to authenticated
  using (public.es_administrador() or public.es_funcionario());

-- -----------------------------------------------------------------------------
-- 14. Privilegios base (los roles anon/authenticated ya tienen grants por defecto
--     en Supabase sobre public; se reafirma lectura y se restringe escritura
--     donde no hay politica de escritura, dejando la via por service_role).
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant select on public.beneficio, public.convocatoria, public.convocatoria_beneficio to anon;
grant insert, update on public.beneficiario, public.acudiente, public.postulacion, public.postulacion_beneficio to authenticated;
grant delete on public.postulacion, public.postulacion_beneficio, public.acudiente to authenticated;
grant insert on public.consentimiento_datos to authenticated;
grant update on public.notificacion to authenticated;

-- Fin de 0001_base.sql
