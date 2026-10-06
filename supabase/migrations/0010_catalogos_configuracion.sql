-- =============================================================================
-- FOEST - Migracion 0010_catalogos_configuracion
-- Catalogos y configuracion (docs/modules/catalogos_configuracion.md)
--
-- Crea lo que falta respecto a 0001-0009:
--   - ies_snies, programa_snies, importacion_snies (catalogo SNIES con busqueda pg_trgm)
--   - texto_consentimiento (consentimiento Ley 1581 versionado; sincronizado con
--     CONSENTIMIENTO_TEXTO / CONSENTIMIENTO_TEXTO_VERSION_VIGENTE de configuracion_sistema
--     para mantener compatible auth y consentimiento_vigente() de 0002)
--   - RPC atomicas: fn_publicar_declaracion, fn_publicar_consentimiento, fn_festivos_reemplazar_anio
--   - resiembra idempotente de claves de configuracion y seed de festivos 2027
-- Idempotente. Asume 0001-0009 aplicadas. Las extensiones pg_trgm y unaccent las crea 0001.
-- =============================================================================

create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- -----------------------------------------------------------------------------
-- 1. Catalogo SNIES
-- -----------------------------------------------------------------------------
create table if not exists public.ies_snies (
  codigo_snies        text primary key check (codigo_snies ~ '^[0-9]{1,10}$'),
  nombre              text not null,
  nombre_normalizado  text not null default '',
  caracter            text check (caracter is null or caracter in ('UNIVERSIDAD','INSTITUCION_UNIVERSITARIA','TECNOLOGICA','TECNICA_PROFESIONAL')),
  sector              text check (sector is null or sector in ('OFICIAL','PRIVADA')),
  departamento        text,
  municipio           text,
  activa              boolean not null default true,
  actualizado_en      timestamptz not null default now()
);
comment on table public.ies_snies is 'Instituciones de educacion superior (listado oficial SNIES del MEN)';
create index if not exists ix_ies_snies_nombre_trgm on public.ies_snies using gin (nombre_normalizado gin_trgm_ops);
create index if not exists ix_ies_snies_activa on public.ies_snies (activa);

create table if not exists public.programa_snies (
  codigo_snies        text primary key check (codigo_snies ~ '^[0-9]{1,10}$'),
  ies_codigo          text not null references public.ies_snies(codigo_snies),
  nombre              text not null,
  nombre_normalizado  text not null default '',
  nivel               text check (nivel is null or nivel in ('TECNICO','TECNOLOGICO','PROFESIONAL','ESPECIALIZACION','MAESTRIA','DOCTORADO')),
  modalidad           text check (modalidad is null or modalidad in ('PRESENCIAL','VIRTUAL','DISTANCIA','DUAL')),
  estado_programa     text not null default 'ACTIVO' check (estado_programa in ('ACTIVO','INACTIVO')),
  departamento_oferta text,
  municipio_oferta    text,
  activo              boolean not null default true,
  actualizado_en      timestamptz not null default now()
);
comment on table public.programa_snies is 'Programas academicos (SNIES). Nunca se borran: activo=false cuando desaparecen del listado';
create index if not exists ix_programa_snies_ies on public.programa_snies (ies_codigo, activo);
create index if not exists ix_programa_snies_nombre_trgm on public.programa_snies using gin (nombre_normalizado gin_trgm_ops);

create table if not exists public.importacion_snies (
  id               uuid primary key default gen_random_uuid(),
  admin_id         uuid references public.usuario(id),
  archivo_nombre   text not null,
  sha256_archivo   text not null,
  modo             text not null default 'REAL' check (modo in ('REAL','SIMULACION')),
  insertados       integer not null default 0,
  actualizados     integer not null default 0,
  desactivados     integer not null default 0,
  errores          jsonb not null default '[]'::jsonb,
  ejecutada_en     timestamptz not null default now()
);
comment on table public.importacion_snies is 'Historial de importaciones del listado SNIES con resumen y errores por fila';
create index if not exists ix_importacion_snies_fecha on public.importacion_snies (ejecutada_en desc);

-- -----------------------------------------------------------------------------
-- 2. Texto de consentimiento versionado (Ley 1581)
-- -----------------------------------------------------------------------------
create table if not exists public.texto_consentimiento (
  id             uuid primary key default gen_random_uuid(),
  version        integer not null unique check (version >= 1),
  texto          text not null,
  vigente        boolean not null default true,
  vigente_desde  date not null default current_date,
  creado_por     uuid references public.usuario(id),
  creado_en      timestamptz not null default now()
);
comment on table public.texto_consentimiento is 'Versiones inmutables del consentimiento de tratamiento de datos; una sola vigente';
create unique index if not exists uq_texto_consentimiento_vigente on public.texto_consentimiento (vigente) where vigente;

-- Inmutabilidad: solo se permite cambiar `vigente` (de true a false) al publicar una version nueva.
create or replace function public.fn_texto_consentimiento_inmutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'TEXTO_CONSENTIMIENTO_INMUTABLE: las versiones no se eliminan' using errcode = '42501';
  end if;
  if new.version <> old.version or new.texto <> old.texto or new.vigente_desde <> old.vigente_desde
     or new.creado_en <> old.creado_en or coalesce(new.creado_por::text, '') <> coalesce(old.creado_por::text, '') then
    raise exception 'TEXTO_CONSENTIMIENTO_INMUTABLE: solo puede cambiar el indicador vigente' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_texto_consentimiento_inmutable on public.texto_consentimiento;
create trigger trg_texto_consentimiento_inmutable before update or delete on public.texto_consentimiento
  for each row execute function public.fn_texto_consentimiento_inmutable();

-- Seed: version 1 desde CONSENTIMIENTO_TEXTO (0002) si aun no hay versiones.
insert into public.texto_consentimiento (version, texto, vigente, vigente_desde)
select
  coalesce((select nullif(trim(valor), '')::integer from public.configuracion_sistema where clave = 'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE'), 1),
  coalesce((select valor from public.configuracion_sistema where clave = 'CONSENTIMIENTO_TEXTO'), 'Texto de consentimiento pendiente de publicar.'),
  true,
  current_date
where not exists (select 1 from public.texto_consentimiento);

-- Igual inmutabilidad para declaraciones publicadas (solo cambia `vigente`).
create or replace function public.fn_declaracion_inmutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DECLARACION_INMUTABLE: las versiones no se eliminan' using errcode = '42501';
  end if;
  if new.codigo <> old.codigo or new.version <> old.version or new.titulo <> old.titulo or new.texto <> old.texto
     or new.texto_oficial_confirmado <> old.texto_oficial_confirmado or new.vigente_desde <> old.vigente_desde then
    raise exception 'DECLARACION_INMUTABLE: solo puede cambiar el indicador vigente' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_declaracion_inmutable on public.declaracion_juramentada;
create trigger trg_declaracion_inmutable before update or delete on public.declaracion_juramentada
  for each row execute function public.fn_declaracion_inmutable();

-- -----------------------------------------------------------------------------
-- 3. RPC atomicas (las invoca la API con service_role tras requirePermission)
-- -----------------------------------------------------------------------------
-- Publica una nueva version de una declaracion: la vigente queda inactiva (no se modifica su texto).
create or replace function public.fn_publicar_declaracion(
  p_codigo text, p_titulo text, p_texto text, p_confirmado boolean, p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
  v_fila    public.declaracion_juramentada;
begin
  if p_codigo !~ '^DECL_[1-6]$' then
    raise exception 'CODIGO_DECLARACION_INVALIDO' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.declaracion_juramentada where codigo = p_codigo;
  update public.declaracion_juramentada set vigente = false where codigo = p_codigo and vigente;
  insert into public.declaracion_juramentada (codigo, version, titulo, texto, vigente, texto_oficial_confirmado, vigente_desde, creado_por)
  values (p_codigo, v_version, p_titulo, p_texto, true, coalesce(p_confirmado, true), current_date, p_actor)
  returning * into v_fila;
  return to_jsonb(v_fila);
end;
$$;
revoke all on function public.fn_publicar_declaracion(text, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.fn_publicar_declaracion(text, text, text, boolean, uuid) to service_role;

-- Publica una nueva version del consentimiento y sincroniza configuracion_sistema en la misma transaccion.
create or replace function public.fn_publicar_consentimiento(p_texto text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
  v_fila    public.texto_consentimiento;
begin
  select coalesce(max(version), 0) + 1 into v_version from public.texto_consentimiento;
  update public.texto_consentimiento set vigente = false where vigente;
  insert into public.texto_consentimiento (version, texto, vigente, vigente_desde, creado_por)
  values (v_version, p_texto, true, current_date, p_actor)
  returning * into v_fila;

  update public.configuracion_sistema
     set valor = v_version::text, version = version + 1, actualizado_por = p_actor, actualizado_en = now()
   where clave = 'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE';
  update public.configuracion_sistema
     set valor = p_texto, version = version + 1, actualizado_por = p_actor, actualizado_en = now(), pendiente_confirmar = false
   where clave = 'CONSENTIMIENTO_TEXTO';
  return to_jsonb(v_fila);
end;
$$;
revoke all on function public.fn_publicar_consentimiento(text, uuid) from public, anon, authenticated;
grant execute on function public.fn_publicar_consentimiento(text, uuid) to service_role;

-- Reemplaza SOLO los festivos de un anio (carga anual). p_festivos: [{fecha, nombre}]
create or replace function public.fn_festivos_reemplazar_anio(p_anio integer, p_festivos jsonb, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eliminados integer;
  v_insertados integer;
begin
  if p_festivos is null or jsonb_typeof(p_festivos) <> 'array' then
    raise exception 'FESTIVOS_INVALIDOS' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_festivos) f where extract(year from (f->>'fecha')::date)::integer <> p_anio) then
    raise exception 'FESTIVOS_FUERA_DEL_ANIO' using errcode = '22023';
  end if;
  delete from public.festivo where anio = p_anio;
  get diagnostics v_eliminados = row_count;
  insert into public.festivo (fecha, nombre, anio, creado_por)
  select distinct on ((f->>'fecha')::date) (f->>'fecha')::date, f->>'nombre', p_anio, p_actor
  from jsonb_array_elements(p_festivos) f;
  get diagnostics v_insertados = row_count;
  return jsonb_build_object('anio', p_anio, 'eliminados', v_eliminados, 'insertados', v_insertados);
end;
$$;
revoke all on function public.fn_festivos_reemplazar_anio(integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fn_festivos_reemplazar_anio(integer, jsonb, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
alter table public.ies_snies            enable row level security;
alter table public.programa_snies       enable row level security;
alter table public.importacion_snies    enable row level security;
alter table public.texto_consentimiento enable row level security;

-- Catalogo SNIES: lectura para cualquier autenticado; escritura solo API (service_role)
drop policy if exists ies_snies_select on public.ies_snies;
create policy ies_snies_select on public.ies_snies for select to authenticated using (true);
drop policy if exists programa_snies_select on public.programa_snies;
create policy programa_snies_select on public.programa_snies for select to authenticated using (true);

-- Historial de importaciones: solo administrador
drop policy if exists importacion_snies_select on public.importacion_snies;
create policy importacion_snies_select on public.importacion_snies for select to authenticated using (public.es_administrador());

-- Consentimiento: lectura para autenticados (el publico usa la API / consentimiento_vigente())
drop policy if exists texto_consentimiento_select on public.texto_consentimiento;
create policy texto_consentimiento_select on public.texto_consentimiento for select to authenticated using (true);

revoke insert, update, delete on public.ies_snies, public.programa_snies, public.importacion_snies, public.texto_consentimiento from anon, authenticated;
grant select on public.ies_snies, public.programa_snies, public.importacion_snies, public.texto_consentimiento to authenticated;

-- Lectura publica (anon) del consentimiento vigente desde la tabla versionada (compatible con 0002).
create or replace function public.consentimiento_vigente()
returns table (version integer, texto text)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (select t.version from public.texto_consentimiento t where t.vigente limit 1),
      (select valor::integer from public.configuracion_sistema where clave = 'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE'),
      1
    ) as version,
    coalesce(
      (select t.texto from public.texto_consentimiento t where t.vigente limit 1),
      (select valor from public.configuracion_sistema where clave = 'CONSENTIMIENTO_TEXTO'),
      ''
    ) as texto;
$$;
grant execute on function public.consentimiento_vigente() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Seeds idempotentes
-- -----------------------------------------------------------------------------
-- Resiembra del catalogo de claves (no sobrescribe valores editados). Corrige descripciones
-- y el valor_defecto de CONSENTIMIENTO_TEXTO que 0002 dejo en null.
insert into public.configuracion_sistema (clave, valor, tipo, categoria, descripcion, valor_defecto, valor_min, valor_max, pendiente_confirmar) values
  ('ACUERDO_VIGENTE_CODIGO', 'ACUERDO-023-2025', 'STRING', 'ACUERDO', 'Codigo del acuerdo aplicable (impreso en formatos). Concordancia con Acuerdo 037 de 2025 por validar', 'ACUERDO-023-2025', null, null, true),
  ('ACUERDO_VIGENTE_TEXTO', 'Acuerdo Municipal 023 de 2025', 'TEXT', 'ACUERDO', 'Texto de referencia mostrado y estampado en los PDF', 'Acuerdo Municipal 023 de 2025', null, null, false),
  ('MAX_TAMANO_ARCHIVO_MB', '10', 'INT', 'DOCUMENTOS', 'Tope por archivo (no puede exceder 10)', '10', '1', '10', false),
  ('CUOTA_POSTULACION_MB', '30', 'INT', 'DOCUMENTOS', 'Cuota total de soportes por postulacion', '30', '10', '200', false),
  ('SUBSANACION_DIAS_HABILES', '5', 'INT', 'PLAZOS', 'Plazo por defecto de subsanacion (dias habiles)', '5', '1', '15', false),
  ('SUBSANACION_DIAS_HABILES_MAX', '15', 'INT', 'PLAZOS', 'Maximo que el funcionario puede fijar al emitir CORRECCION', '15', '1', '30', false),
  ('ALERTA_CIERRE_DIAS', '7', 'INT', 'ALERTAS', 'Dias naturales antes del cierre para alertar y recordar', '7', '1', '30', false),
  ('ALERTA_SOBRECARGA_PENDIENTES', '50', 'INT', 'ALERTAS', 'Postulaciones PENDIENTE acumuladas para considerar sobrecarga', '50', '1', '1000', false),
  ('ALERTA_SOBRECARGA_DIAS_HABILES', '5', 'INT', 'ALERTAS', 'Dias habiles sin revisiones para marcar cuello de botella', '5', '1', '30', false),
  ('ALERTA_ASIGNACION_SIN_MOVIMIENTO_DIAS_HABILES', '5', 'INT', 'ALERTAS', 'Dias habiles sin movimiento en una asignacion ACTIVA antes de alertar', '5', '1', '60', true),
  ('ALERTA_POOL_DIAS_HABILES', '3', 'INT', 'ALERTAS', 'Dias habiles que una postulacion PENDIENTE puede esperar sin ser tomada', '3', '1', '30', false),
  ('ALERTA_SUBSANACION_DIAS_HABILES', '2', 'INT', 'ALERTAS', 'Dias habiles antes del vencimiento de una subsanacion para alertar', '2', '1', '15', false),
  ('ALERTA_CUPO_AVISO_PCT', '90', 'INT', 'ALERTAS', 'Porcentaje de ocupacion de cupos/presupuesto desde el que se avisa', '90', '50', '100', false),
  ('ALERTA_TRABAJOS_HORAS', '24', 'INT', 'ALERTAS', 'Ventana en horas para alertar reportes o correos fallidos', '24', '1', '168', false),
  ('KANON_UMBRAL', '5', 'INT', 'PRIVACIDAD', 'Umbral de k-anonimato en dashboards', '5', '2', '50', false),
  ('SESIONES_MAX', '3', 'INT', 'SEGURIDAD', 'Sesiones activas por usuario', '3', '1', '10', false),
  ('RECORDATORIO_BORRADOR_DIAS', '5', 'INT', 'PLAZOS', 'Dias antes del cierre para recordar al beneficiario con borrador', '5', '1', '30', false),
  ('RECORDATORIO_SUBSANACION_DIAS_HABILES', '2', 'INT', 'PLAZOS', 'Dias habiles antes de fecha_limite_subsanacion para avisar', '2', '1', '5', false),
  ('FECHA_PROXIMA_APERTURA_ESTIMADA', null, 'DATE', 'PLAZOS', 'Fecha estimada mostrada cuando no hay convocatoria abierta', null, null, null, false),
  ('CONSENTIMIENTO_TEXTO_VERSION_VIGENTE', '1', 'INT', 'PRIVACIDAD', 'Version vigente del consentimiento; solo cambia publicando una version', '1', '1', null, false),
  ('CONSENTIMIENTO_TEXTO', 'Texto de consentimiento pendiente de publicar.', 'TEXT', 'PRIVACIDAD', 'Texto vigente del consentimiento de tratamiento de datos mostrado en el registro (sincronizado con texto_consentimiento)', null, null, null, true),
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

-- Festivos Colombia 2027 (anio siguiente; Ley 51 de 1983 / Ley Emiliani). 2026 lo siembra 0001.
insert into public.festivo (fecha, nombre, anio) values
  ('2027-01-01', 'Ano Nuevo', 2027),
  ('2027-01-11', 'Dia de los Reyes Magos', 2027),
  ('2027-03-22', 'Dia de San Jose', 2027),
  ('2027-03-25', 'Jueves Santo', 2027),
  ('2027-03-26', 'Viernes Santo', 2027),
  ('2027-05-01', 'Dia del Trabajo', 2027),
  ('2027-05-10', 'Ascension del Senor', 2027),
  ('2027-05-31', 'Corpus Christi', 2027),
  ('2027-06-07', 'Sagrado Corazon de Jesus', 2027),
  ('2027-07-05', 'San Pedro y San Pablo', 2027),
  ('2027-07-20', 'Dia de la Independencia', 2027),
  ('2027-08-07', 'Batalla de Boyaca', 2027),
  ('2027-08-16', 'Asuncion de la Virgen', 2027),
  ('2027-10-18', 'Dia de la Raza', 2027),
  ('2027-11-01', 'Todos los Santos', 2027),
  ('2027-11-15', 'Independencia de Cartagena', 2027),
  ('2027-12-08', 'Inmaculada Concepcion', 2027),
  ('2027-12-25', 'Navidad', 2027)
on conflict (fecha) do nothing;

-- Fin de 0010_catalogos_configuracion.sql
