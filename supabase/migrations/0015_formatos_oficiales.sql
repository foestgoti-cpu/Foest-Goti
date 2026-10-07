-- =============================================================================
-- 0015_formatos_oficiales.sql - Modulo formatos_oficiales (docs/modules/formatos_oficiales.md)
-- Idempotente. Asume aplicadas 0001..0013 (postulacion, usuario, puede_leer_postulacion).
-- 0014 (documentos) puede aplicarse antes o despues: el FK documento.formato_generado_id
-- se anade solo si la tabla `documento` y la columna existen.
--
-- Contenido:
--   1. formato_generado            registro de cada generacion de GE-F041 / GE-F043
--   2. fn_formato_marcar_listo     transicion atomica GENERANDO -> LISTO (invalida el vigente previo)
--   3. fn_verificar_formato        verificacion publica por codigo (sin datos personales)
--   4. FK documento.formato_generado_id (condicional, idempotente)
--   5. RLS y privilegios
--   6. Bucket privado `formatos` de Supabase Storage y politicas de lectura
-- La API escribe con service_role (bypass RLS); los usuarios solo leen lo que pueden ver.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. formato_generado
-- -----------------------------------------------------------------------------
create table if not exists public.formato_generado (
  id                   uuid primary key default gen_random_uuid(),
  tipo                 text not null check (tipo in ('GE-F041', 'GE-F043')),
  postulacion_id       uuid not null references public.postulacion(id) on delete cascade,
  generado_por         uuid not null references public.usuario(id),
  estado               text not null default 'GENERANDO' check (estado in ('GENERANDO', 'LISTO', 'FALLIDO')),
  version_plantilla    text not null,
  hash_contenido       text not null check (hash_contenido ~ '^[0-9a-f]{64}$'),
  sha256_archivo       text check (sha256_archivo is null or sha256_archivo ~ '^[0-9a-f]{64}$'),
  codigo_verificacion  text not null check (codigo_verificacion ~ '^[A-Za-z0-9_-]{22}$'),
  storage_key          text,
  tamano_bytes         integer check (tamano_bytes is null or tamano_bytes > 0),
  vigente              boolean not null default false,
  invalidado_en        timestamptz,
  motivo_invalidacion  text check (motivo_invalidacion is null or motivo_invalidacion in ('REGENERADO', 'ELIMINADO')),
  detalle_error        text,
  generado_en          timestamptz not null default now(),
  -- Un formato LISTO siempre tiene archivo, huella y tamano.
  constraint ck_formato_listo_completo check (
    estado <> 'LISTO' or (sha256_archivo is not null and storage_key is not null and tamano_bytes is not null)
  ),
  -- Solo un formato LISTO puede ser vigente.
  constraint ck_formato_vigente_listo check (not vigente or estado = 'LISTO')
);
comment on table public.formato_generado is 'GE-F041 / GE-F043 generados. sha256_archivo solo vive aqui (nunca se estampa en el PDF). El QR lleva unicamente codigo_verificacion.';

create unique index if not exists uq_formato_codigo_verificacion on public.formato_generado (codigo_verificacion);
-- A lo sumo un formato vigente por (postulacion, tipo).
create unique index if not exists uq_formato_vigente on public.formato_generado (postulacion_id, tipo)
  where vigente and estado = 'LISTO';
-- A lo sumo una generacion en curso por (postulacion, tipo): GENERACION_EN_CURSO.
create unique index if not exists uq_formato_generando on public.formato_generado (postulacion_id, tipo)
  where estado = 'GENERANDO';
create index if not exists ix_formato_postulacion on public.formato_generado (postulacion_id, tipo, generado_en desc);

-- sha256_archivo y codigo_verificacion son inmutables una vez LISTO; el hash de contenido nunca cambia.
create or replace function public.fn_formato_inmutable()
returns trigger
language plpgsql
as $$
begin
  if new.codigo_verificacion is distinct from old.codigo_verificacion
     or new.hash_contenido is distinct from old.hash_contenido
     or new.tipo is distinct from old.tipo
     or new.postulacion_id is distinct from old.postulacion_id then
    raise exception 'FORMATO_INMUTABLE: tipo, postulacion, hash_contenido y codigo_verificacion no se modifican';
  end if;
  if old.estado = 'LISTO' and (
       new.sha256_archivo is distinct from old.sha256_archivo
       or new.storage_key is distinct from old.storage_key
       or new.tamano_bytes is distinct from old.tamano_bytes
       or new.estado is distinct from old.estado) then
    raise exception 'FORMATO_INMUTABLE: un formato LISTO no cambia su archivo ni su huella';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_formato_inmutable on public.formato_generado;
create trigger trg_formato_inmutable before update on public.formato_generado
  for each row execute function public.fn_formato_inmutable();

-- -----------------------------------------------------------------------------
-- 2. fn_formato_marcar_listo: en una sola transaccion invalida el vigente previo del
--    mismo tipo (REGENERADO) y deja este formato LISTO y vigente.
-- -----------------------------------------------------------------------------
create or replace function public.fn_formato_marcar_listo(
  p_formato_id    uuid,
  p_sha256        text,
  p_storage_key   text,
  p_tamano_bytes  integer
)
returns public.formato_generado
language plpgsql
security definer
set search_path = public
as $$
declare
  v_formato public.formato_generado;
begin
  select * into v_formato from public.formato_generado where id = p_formato_id for update;
  if not found then
    raise exception 'FORMATO_NO_ENCONTRADO';
  end if;
  if v_formato.estado <> 'GENERANDO' then
    raise exception 'FORMATO_ESTADO_INVALIDO: el formato no esta en GENERANDO';
  end if;

  update public.formato_generado
     set vigente = false, invalidado_en = now(), motivo_invalidacion = 'REGENERADO'
   where postulacion_id = v_formato.postulacion_id
     and tipo = v_formato.tipo
     and vigente
     and id <> p_formato_id;

  update public.formato_generado
     set estado = 'LISTO', vigente = true, sha256_archivo = p_sha256,
         storage_key = p_storage_key, tamano_bytes = p_tamano_bytes
   where id = p_formato_id
   returning * into v_formato;

  return v_formato;
end;
$$;
revoke execute on function public.fn_formato_marcar_listo(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.fn_formato_marcar_listo(uuid, text, text, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Verificacion publica: SOLO valido, tipo, generado_en y sha256. Sin datos personales.
--    Siempre devuelve una fila (valido=false con nulos si el codigo no existe).
-- -----------------------------------------------------------------------------
create or replace function public.fn_verificar_formato(p_codigo text)
returns table (valido boolean, tipo text, generado_en timestamptz, sha256 text)
language sql
stable
security definer
set search_path = public
as $$
  select (f.id is not null) as valido, f.tipo, f.generado_en, f.sha256_archivo
  from (select 1) base
  left join public.formato_generado f
    on f.codigo_verificacion = p_codigo and f.estado = 'LISTO';
$$;
revoke execute on function public.fn_verificar_formato(text) from public, anon, authenticated;
grant execute on function public.fn_verificar_formato(text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. FK documento.formato_generado_id -> formato_generado(id) (0014, dueno: documentos)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.documento') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'documento' and column_name = 'formato_generado_id'
     )
     and not exists (
       select 1 from pg_constraint
       where conname = 'fk_documento_formato_generado' and conrelid = 'public.documento'::regclass
     ) then
    alter table public.documento
      add constraint fk_documento_formato_generado
      foreign key (formato_generado_id) references public.formato_generado(id) on delete set null;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 5. RLS: lectura para el duenio y para quien tiene alcance de lectura de la postulacion
--    (comite del funcionario, administrador). Escrituras solo service_role.
-- -----------------------------------------------------------------------------
alter table public.formato_generado enable row level security;

drop policy if exists formato_generado_select on public.formato_generado;
create policy formato_generado_select on public.formato_generado
  for select to authenticated
  using (public.puede_leer_postulacion(postulacion_id));

revoke insert, update, delete, truncate on public.formato_generado from anon, authenticated;
revoke select on public.formato_generado from anon;

-- -----------------------------------------------------------------------------
-- 6. Storage: bucket privado `formatos`; clave `<postulacion_id>/<formato_id>.pdf` (sin PII).
--    Las URL firmadas las genera la API con service_role; la politica permite ademas
--    la lectura directa a quien puede leer la postulacion.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('formatos', 'formatos', false)
    on conflict (id) do update set public = false;
  end if;
end
$$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists formatos_lectura on storage.objects;
    create policy formatos_lectura on storage.objects
      for select to authenticated
      using (
        bucket_id = 'formatos'
        and case
          when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
            then public.puede_leer_postulacion(((storage.foldername(name))[1])::uuid)
          else false
        end
      );
  end if;
exception
  when insufficient_privilege then
    raise notice 'No se pudo crear la politica formatos_lectura (privilegios); el acceso sigue siendo solo por URL firmada de service_role.';
end
$$;
