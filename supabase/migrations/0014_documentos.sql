-- =============================================================================
-- 0014_documentos.sql - Modulo documentos (docs/modules/documentos.md)
-- Idempotente. Asume aplicadas 0001..0013 (usuario, beneficio, postulacion,
-- asignacion_funcionario, funciones de rol/alcance de 0001).
--
-- Contenido:
--   1. tipo_documento           catalogo de los 13 tipos (seed)
--   2. requisito_documento      matriz tipo x beneficio x tipo de tramite (seed de 285 filas)
--   3. documento                un documento por tipo y postulacion (eliminacion logica)
--   4. documento_version        historial de versiones (estado de carga, hash SHA-256 del servidor)
--   5. bucket privado `documentos` en Supabase Storage y politicas
--   6. fn_documento_acceso_funcionario   puerto provisional de alcance del funcionario
--   7. RLS y privilegios
--
-- Las escrituras las hace la API con service_role (bypass RLS). `documento.formato_generado_id`
-- se crea SIN foreign key: formatos_oficiales (0015) la agrega con `alter table ... add constraint`.
-- No existe estado de revision aqui: lo deriva el modulo evaluacion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. tipo_documento
-- -----------------------------------------------------------------------------
create table if not exists public.tipo_documento (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique
                   check (codigo in ('DOC_ID','DIP_BACH','RES_ICFES','CERT_ESC','SISBEN','CERT_RES','LIQ_MAT','PAG_CART','FORM_INS','CERT_NOT','LAB_SOC','HOR_CLA','SOP_ESP')),
  nombre           text not null,
  descripcion      text not null default '',
  formato_oficial  text check (formato_oficial is null or formato_oficial in ('GE-F041','GE-F043','GE-F038')),
  creado_en        timestamptz not null default now()
);
comment on table public.tipo_documento is 'Catalogo de tipos de soporte (documentos.md). Escritura solo por migracion.';

insert into public.tipo_documento (codigo, nombre, descripcion, formato_oficial) values
  ('DOC_ID',    'Documento de identidad',                     'Cedula o tarjeta de identidad ampliada al 150 %',  null),
  ('DIP_BACH',  'Diploma de bachiller o acta de grado',       'Primera vez',                                      null),
  ('RES_ICFES', 'Resultados Saber 11',                        'Certificado oficial del ICFES',                    null),
  ('CERT_ESC',  'Certificado de escolaridad',                 'Cinco anos de estudio en Tocancipa',               null),
  ('SISBEN',    'Certificado SISBEN IV',                      'Consulta oficial del DNP',                         null),
  ('CERT_RES',  'Certificado de residencia',                  'Expedido por la Secretaria de Gobierno',           null),
  ('LIQ_MAT',   'Recibo o liquidacion de matricula',          'Periodo a cursar',                                 null),
  ('PAG_CART',  'Pagare y carta de instrucciones firmados',   'Formato GE-F043 firmado',                          'GE-F043'),
  ('FORM_INS',  'Formulario de inscripcion firmado',          'Formato GE-F041 firmado',                          'GE-F041'),
  ('CERT_NOT',  'Certificado oficial de notas',               'Promedio semestral y acumulado',                   null),
  ('LAB_SOC',   'Certificado de labor social',                'Formato GE-F038, renovaciones',                    'GE-F038'),
  ('HOR_CLA',   'Horario de clases oficial',                  'Justifica el subsidio de transporte',              null),
  ('SOP_ESP',   'Soportes de linea especial',                 'Discapacidad, pertenencia etnica o victima',       null)
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- 2. requisito_documento
-- -----------------------------------------------------------------------------
create table if not exists public.requisito_documento (
  id                uuid primary key default gen_random_uuid(),
  tipo_id           uuid not null references public.tipo_documento(id),
  beneficio_codigo  text not null references public.beneficio(codigo),
  tipo_tramite      text not null check (tipo_tramite in ('PRIMERA_VEZ','RENOVACION','REINTEGRO')),
  obligatorio       boolean not null default true,
  unique (tipo_id, beneficio_codigo, tipo_tramite)
);
comment on table public.requisito_documento is 'Matriz de soportes exigidos por beneficio y tipo de tramite. Propuesta inicial pendiente de validacion juridica (Acuerdo 023 de 2025).';
create index if not exists ix_requisito_documento_beneficio on public.requisito_documento (beneficio_codigo, tipo_tramite);

-- Seed por reglas compactas (producto cartesiano beneficios x tramites). Idempotente.
with reglas (tipo, beneficios, tramites) as (
  values
    ('DOC_ID',    array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['PRIMERA_VEZ','RENOVACION','REINTEGRO']::text[]),
    ('FORM_INS',  array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['PRIMERA_VEZ','RENOVACION','REINTEGRO']::text[]),
    ('PAG_CART',  array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['PRIMERA_VEZ','RENOVACION','REINTEGRO']::text[]),
    ('SISBEN',    array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['PRIMERA_VEZ','RENOVACION','REINTEGRO']::text[]),
    ('CERT_RES',  array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['PRIMERA_VEZ','RENOVACION','REINTEGRO']::text[]),
    ('DIP_BACH',  array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['PRIMERA_VEZ']::text[]),
    ('RES_ICFES', array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['PRIMERA_VEZ']::text[]),
    ('RES_ICFES', array['S11']::text[],                                                                array['RENOVACION','REINTEGRO']::text[]),
    ('CERT_ESC',  array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['PRIMERA_VEZ']::text[]),
    ('LIQ_MAT',   array['SUP','ST','EA']::text[],                                                      array['PRIMERA_VEZ','RENOVACION','REINTEGRO']::text[]),
    ('CERT_NOT',  array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['RENOVACION','REINTEGRO']::text[]),
    ('CERT_NOT',  array['EA']::text[],                                                                 array['PRIMERA_VEZ']::text[]),
    ('LAB_SOC',   array['S11','EA','DEP','CUL','SUP','ST','LE1','LE2','LE3','LE4','LE5','LE6']::text[], array['RENOVACION']::text[]),
    ('HOR_CLA',   array['ST']::text[],                                                                 array['PRIMERA_VEZ','RENOVACION','REINTEGRO']::text[]),
    ('SOP_ESP',   array['LE1','LE2','LE3','LE4','LE5','LE6']::text[],                                  array['PRIMERA_VEZ','RENOVACION','REINTEGRO']::text[])
)
insert into public.requisito_documento (tipo_id, beneficio_codigo, tipo_tramite, obligatorio)
select t.id, b.beneficio, tr.tramite, true
from reglas r
join public.tipo_documento t on t.codigo = r.tipo
cross join lateral unnest(r.beneficios) as b(beneficio)
cross join lateral unnest(r.tramites) as tr(tramite)
on conflict (tipo_id, beneficio_codigo, tipo_tramite) do nothing;

-- -----------------------------------------------------------------------------
-- 3. documento
-- -----------------------------------------------------------------------------
create table if not exists public.documento (
  id                   uuid primary key default gen_random_uuid(),
  postulacion_id       uuid not null references public.postulacion(id) on delete cascade,
  tipo_id              uuid not null references public.tipo_documento(id),
  version_actual       integer not null default 1 check (version_actual >= 1),
  estado_carga         text not null default 'SUBIENDO'
                       check (estado_carga in ('SUBIENDO','ESCANEANDO','DISPONIBLE','RECHAZADO_ARCHIVO')),
  -- Copia de los datos de la version vigente (sincronizada por la API).
  storage_key          text,
  nombre_original      text,
  mime_type            text,
  tamano_bytes         bigint,
  sha256               text,
  -- Vinculo con FORMATO_GENERADO (0015). SIN foreign key a proposito.
  formato_generado_id  uuid,
  subido_en            timestamptz,
  eliminado            boolean not null default false,
  eliminado_en         timestamptz,
  eliminado_por        uuid references public.usuario(id),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
comment on table public.documento is 'Soporte por tipo y postulacion. estado_carga es el de la version vigente. Sin estado_revision (lo deriva evaluacion).';
comment on column public.documento.formato_generado_id is 'FORMATO_GENERADO vinculado (FORM_INS / PAG_CART). Sin FK; la agrega 0015.';

-- Un documento por tipo entre los no eliminados: los reemplazos crean versiones.
create unique index if not exists uq_documento_postulacion_tipo
  on public.documento (postulacion_id, tipo_id) where eliminado = false;
create index if not exists ix_documento_postulacion on public.documento (postulacion_id);
create index if not exists ix_documento_eliminado_en on public.documento (eliminado_en) where eliminado = true;

drop trigger if exists trg_documento_actualizado_en on public.documento;
create trigger trg_documento_actualizado_en before update on public.documento
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- 4. documento_version
-- -----------------------------------------------------------------------------
create table if not exists public.documento_version (
  id                      uuid primary key default gen_random_uuid(),
  documento_id            uuid not null references public.documento(id) on delete cascade,
  version                 integer not null check (version >= 1),
  storage_key             text not null unique,
  nombre_original         text,
  mime_type               text,
  tamano_bytes            bigint,
  sha256                  text,
  estado_carga            text not null default 'SUBIENDO'
                          check (estado_carga in ('SUBIENDO','ESCANEANDO','DISPONIBLE','RECHAZADO_ARCHIVO')),
  motivo_rechazo_archivo  text,
  formato_generado_id     uuid,
  motivo_reemplazo        text,
  escaneo                 text check (escaneo is null or escaneo in ('LIMPIO','OMITIDO')),
  creado_en               timestamptz not null default now(),
  disponible_en           timestamptz,
  unique (documento_id, version)
);
comment on table public.documento_version is 'Historial de versiones de un documento. El SHA-256 lo calcula el servidor (Ley 527 de 1999).';
create index if not exists ix_documento_version_estado on public.documento_version (estado_carga, creado_en);
create index if not exists ix_documento_version_subiendo on public.documento_version (creado_en) where estado_carga = 'SUBIENDO';

-- -----------------------------------------------------------------------------
-- 5. Bucket privado `documentos` y politicas (solo service_role)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

update storage.buckets set public = false where id = 'documentos';

do $$
begin
  drop policy if exists documentos_service_role_total on storage.objects;
  create policy documentos_service_role_total on storage.objects
    for all to service_role
    using (bucket_id = 'documentos')
    with check (bucket_id = 'documentos');
exception when insufficient_privilege then
  raise notice 'Sin privilegios para crear la politica sobre storage.objects; el bucket queda privado y sin politicas para usuarios (solo service_role).';
end $$;

-- -----------------------------------------------------------------------------
-- 6. Puerto provisional de alcance del funcionario sobre un expediente
--    PROVISIONAL(asignaciones): si existe `postulacion_asignacion` (0016) exige una
--    asignacion ACTIVA del funcionario; si no, usa la pertenencia vigente al comite.
-- -----------------------------------------------------------------------------
create or replace function public.fn_documento_acceso_funcionario(p_funcionario uuid, p_postulacion uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  if to_regclass('public.postulacion_asignacion') is not null then
    execute 'select exists (select 1 from public.postulacion_asignacion pa
                            where pa.postulacion_id = $1 and pa.funcionario_id = $2 and pa.estado = ''ACTIVA'')'
      into v_ok using p_postulacion, p_funcionario;
    return coalesce(v_ok, false);
  end if;
  select exists (
    select 1
    from public.postulacion p
    join public.asignacion_funcionario af on af.convocatoria_id = p.convocatoria_id
    where p.id = p_postulacion and af.funcionario_id = p_funcionario and af.retirado_en is null
  ) into v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke execute on function public.fn_documento_acceso_funcionario(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_documento_acceso_funcionario(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 7. RLS y privilegios
-- -----------------------------------------------------------------------------
alter table public.tipo_documento      enable row level security;
alter table public.requisito_documento enable row level security;
alter table public.documento           enable row level security;
alter table public.documento_version   enable row level security;

-- Catalogos: lectura para cualquier usuario autenticado.
drop policy if exists tipo_documento_select on public.tipo_documento;
create policy tipo_documento_select on public.tipo_documento for select to authenticated using (true);

drop policy if exists requisito_documento_select on public.requisito_documento;
create policy requisito_documento_select on public.requisito_documento for select to authenticated using (true);

-- documento: el beneficiario solo los suyos; el funcionario los de las convocatorias de su comite;
-- el administrador todos (incluidos los eliminados logicamente).
drop policy if exists documento_select on public.documento;
create policy documento_select on public.documento for select to authenticated
  using (public.puede_leer_postulacion(postulacion_id) and (eliminado = false or public.es_administrador()));

drop policy if exists documento_version_select on public.documento_version;
create policy documento_version_select on public.documento_version for select to authenticated
  using (exists (
    select 1 from public.documento d
    where d.id = documento_version.documento_id
      and public.puede_leer_postulacion(d.postulacion_id)
      and (d.eliminado = false or public.es_administrador())
  ));

-- Sin politicas de escritura: INSERT/UPDATE/DELETE solo con service_role (API).
revoke insert, update, delete, truncate on public.tipo_documento      from anon, authenticated;
revoke insert, update, delete, truncate on public.requisito_documento from anon, authenticated;
revoke insert, update, delete, truncate on public.documento           from anon, authenticated;
revoke insert, update, delete, truncate on public.documento_version   from anon, authenticated;
revoke all on public.tipo_documento, public.requisito_documento, public.documento, public.documento_version from anon;
