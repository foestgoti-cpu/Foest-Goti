-- =============================================================================
-- 0019_labor_social.sql - Modulo labor_social (docs/modules/labor_social.md)
-- Idempotente. Asume aplicadas 0001..0013 (beneficiario, postulacion, usuario, configuracion_sistema,
-- fn_set_actualizado_en, es_mi_beneficiario, es_administrador, es_funcionario) y 0009 (fn_config_int,
-- fn_hoy_bogota). 0016 (postulacion_asignacion) es OPCIONAL: si no existe, el funcionario no lee nada.
--
-- Contenido:
--   1. certificado_labor_social   (columnas que ya lee el puerto de evaluacion: beneficiario_id,
--                                  total_horas_acumuladas, horas_minimas_requeridas, estado, creado_en)
--   2. actividad_labor_social
--   3. labor_social_emision       (emisiones definitivas del GE-F038; inmutables)
--   4. Triggers: validacion de actividades (estado, fecha no futura, tope diario), recalculo exacto de
--      total_horas_acumuladas, maquina de estados, inmutabilidad cuando estado = PRESENTADO
--   5. Claves de configuracion: LABOR_SOCIAL_HORAS_MINIMAS (ya existe, por confirmar) y
--      LABOR_SOCIAL_HORAS_MAX_DIA (se siembra)
--   6. fn_verificar_labor_social: verificacion publica (solo valido, tipo, generado_en, sha256)
--   7. RLS (beneficiario: lo propio; funcionario con asignacion ACTIVA: lectura; administrador: todo;
--      escrituras solo service_role)
--   8. Bucket privado `formatos` (compartido con formatos_oficiales; las emisiones van bajo `labor-social/`)
-- Sin permisos nuevos: labor_social:consultar|registrar|validar|gestionar ya estan en el seed de 0001.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. certificado_labor_social
-- -----------------------------------------------------------------------------
create table if not exists public.certificado_labor_social (
  id                        uuid primary key default gen_random_uuid(),
  beneficiario_id           uuid not null references public.beneficiario(id) on delete cascade,
  postulacion_id            uuid references public.postulacion(id) on delete set null,
  semestre_academico        text not null check (semestre_academico ~ '^[0-9]{4}-[12]$'),
  -- Derivado: lo recalcula el trigger desde actividad_labor_social (suma numeric exacta).
  total_horas_acumuladas    numeric(7,2) not null default 0 check (total_horas_acumuladas >= 0),
  -- Copia de LABOR_SOCIAL_HORAS_MINIMAS al crear; un cambio posterior de configuracion no la altera.
  horas_minimas_requeridas  numeric(7,2) not null default 0 check (horas_minimas_requeridas >= 0),
  estado                    text not null default 'EN_PROCESO' check (estado in ('EN_PROCESO', 'COMPLETADO', 'PRESENTADO')),
  -- documento LAB_SOC (modulo documentos, 0014). Sin FK a proposito: la tabla puede no existir aun.
  soporte_documento_id      uuid,
  completado_en             timestamptz,
  presentado_en             timestamptz,
  version                   integer not null default 1 check (version >= 1),
  creado_en                 timestamptz not null default now(),
  actualizado_en            timestamptz not null default now(),
  constraint ck_cls_presentado_soporte check (estado <> 'PRESENTADO' or (soporte_documento_id is not null and presentado_en is not null))
);
comment on table public.certificado_labor_social is 'Certificado de labor social por semestre (GE-F038). total_horas_acumuladas es derivado (trigger). PRESENTADO es terminal e inmutable.';

-- Un certificado por postulacion y uno por (beneficiario, semestre).
create unique index if not exists uq_cls_postulacion on public.certificado_labor_social (postulacion_id) where postulacion_id is not null;
create unique index if not exists uq_cls_beneficiario_semestre on public.certificado_labor_social (beneficiario_id, semestre_academico);
create index if not exists ix_cls_beneficiario on public.certificado_labor_social (beneficiario_id, creado_en desc);

-- -----------------------------------------------------------------------------
-- 2. actividad_labor_social
-- -----------------------------------------------------------------------------
create table if not exists public.actividad_labor_social (
  id                      uuid primary key default gen_random_uuid(),
  certificado_id          uuid not null references public.certificado_labor_social(id) on delete cascade,
  fecha_actividad         date not null,
  horas_ejecutadas        numeric(4,2) not null check (horas_ejecutadas > 0 and horas_ejecutadas <= 24),
  descripcion_actividad   text not null check (char_length(btrim(descripcion_actividad)) between 10 and 500),
  dependencia_municipal   text not null check (char_length(btrim(dependencia_municipal)) between 1 and 200),
  nombre_supervisor       text not null check (char_length(btrim(nombre_supervisor)) between 1 and 200),
  cargo_supervisor        text not null check (char_length(btrim(cargo_supervisor)) between 1 and 200),
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);
create index if not exists ix_als_certificado on public.actividad_labor_social (certificado_id, fecha_actividad, creado_en);

drop trigger if exists trg_als_actualizado_en on public.actividad_labor_social;
create trigger trg_als_actualizado_en before update on public.actividad_labor_social
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- 3. labor_social_emision (emisiones definitivas; el sha256 del archivo NUNCA va dentro del PDF)
-- -----------------------------------------------------------------------------
create table if not exists public.labor_social_emision (
  id                    uuid primary key default gen_random_uuid(),
  certificado_id        uuid not null references public.certificado_labor_social(id) on delete cascade,
  hash_contenido        text not null check (hash_contenido ~ '^[0-9a-f]{64}$'),
  codigo_verificacion   text not null check (codigo_verificacion ~ '^[A-Za-z0-9_-]{22}$'),
  sha256_archivo        text not null check (sha256_archivo ~ '^[0-9a-f]{64}$'),
  storage_key           text not null,
  total_paginas         integer not null check (total_paginas >= 1),
  emitido_en            timestamptz not null default now()
);
comment on table public.labor_social_emision is 'Emisiones definitivas del GE-F038. El QR lleva solo codigo_verificacion (128 bits). Inmutable.';
create unique index if not exists uq_lse_codigo on public.labor_social_emision (codigo_verificacion);
create index if not exists ix_lse_certificado on public.labor_social_emision (certificado_id, emitido_en desc);

create or replace function public.fn_ls_emision_inmutable()
returns trigger
language plpgsql
as $$
begin
  -- Un certificado eliminado en cascada (solo EN_PROCESO, sin emisiones por regla de servicio) puede arrastrar sus emisiones.
  if tg_op = 'DELETE' and not exists (select 1 from public.certificado_labor_social c where c.id = old.certificado_id) then
    return old;
  end if;
  raise exception 'EMISION_INMUTABLE: las emisiones de labor social no se modifican ni se eliminan';
end;
$$;

drop trigger if exists trg_lse_inmutable on public.labor_social_emision;
create trigger trg_lse_inmutable before update or delete on public.labor_social_emision
  for each row execute function public.fn_ls_emision_inmutable();

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------
-- 4.1 Actividad: solo con certificado EN_PROCESO, fecha no futura (America/Bogota) y tope diario.
create or replace function public.fn_ls_actividad_validar()
returns trigger
language plpgsql
as $$
declare
  v_estado   text;
  v_cert     uuid;
  v_max_dia  numeric;
  v_dia      numeric;
begin
  v_cert := case when tg_op = 'DELETE' then old.certificado_id else new.certificado_id end;

  -- Bloquea el certificado: serializa altas concurrentes y la suma diaria.
  select c.estado into v_estado from public.certificado_labor_social c where c.id = v_cert for update;
  if not found then
    -- Borrado en cascada del certificado: nada que validar.
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_estado <> 'EN_PROCESO' then
    raise exception 'CERTIFICADO_NO_EDITABLE: solo se modifican actividades con el certificado EN_PROCESO';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and new.certificado_id is distinct from old.certificado_id then
    raise exception 'ACTIVIDAD_INMUTABLE: una actividad no cambia de certificado';
  end if;
  if new.fecha_actividad > public.fn_hoy_bogota() then
    raise exception 'FECHA_FUTURA: la fecha de la actividad no puede ser futura';
  end if;

  v_max_dia := public.fn_config_int('LABOR_SOCIAL_HORAS_MAX_DIA', 8);
  select coalesce(sum(a.horas_ejecutadas), 0) into v_dia
    from public.actividad_labor_social a
   where a.certificado_id = new.certificado_id
     and a.fecha_actividad = new.fecha_actividad
     and a.id <> new.id;
  if v_dia + new.horas_ejecutadas > v_max_dia then
    raise exception 'HORAS_DIA_EXCEDIDAS: el total de horas de la fecha supera el maximo diario de % horas', v_max_dia;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_als_validar on public.actividad_labor_social;
create trigger trg_als_validar before insert or update or delete on public.actividad_labor_social
  for each row execute function public.fn_ls_actividad_validar();

-- 4.2 Tras cambiar una actividad, "toca" el certificado: su trigger BEFORE UPDATE recalcula el total y la version.
create or replace function public.fn_ls_actividad_recalcular()
returns trigger
language plpgsql
as $$
declare
  v_cert uuid;
begin
  v_cert := case when tg_op = 'DELETE' then old.certificado_id else new.certificado_id end;
  update public.certificado_labor_social
     set version = version + 1
   where id = v_cert;
  return null;
end;
$$;

drop trigger if exists trg_als_recalcular on public.actividad_labor_social;
create trigger trg_als_recalcular after insert or update or delete on public.actividad_labor_social
  for each row execute function public.fn_ls_actividad_recalcular();

-- 4.3 Certificado: maquina de estados, total derivado, inmutabilidad de PRESENTADO.
create or replace function public.fn_ls_certificado_guard()
returns trigger
language plpgsql
as $$
declare
  v_total numeric(7,2);
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'EN_PROCESO' then
      raise exception 'CERTIFICADO_NO_EDITABLE: solo se elimina un certificado EN_PROCESO';
    end if;
    return old;
  end if;

  if old.estado = 'PRESENTADO' then
    raise exception 'CERTIFICADO_PRESENTADO_INMUTABLE: un certificado PRESENTADO no se modifica';
  end if;

  if new.beneficiario_id is distinct from old.beneficiario_id
     or new.postulacion_id is distinct from old.postulacion_id
     or new.semestre_academico is distinct from old.semestre_academico
     or new.horas_minimas_requeridas is distinct from old.horas_minimas_requeridas
     or new.creado_en is distinct from old.creado_en then
    raise exception 'CERTIFICADO_INMUTABLE: beneficiario, postulacion, semestre y horas minimas no se modifican';
  end if;

  select coalesce(sum(a.horas_ejecutadas), 0)::numeric(7,2) into v_total
    from public.actividad_labor_social a where a.certificado_id = new.id;
  new.total_horas_acumuladas := v_total;
  new.actualizado_en := now();

  if new.estado is distinct from old.estado then
    if not ((old.estado = 'EN_PROCESO' and new.estado = 'COMPLETADO')
         or (old.estado = 'COMPLETADO' and new.estado in ('EN_PROCESO', 'PRESENTADO'))) then
      raise exception 'TRANSICION_INVALIDA: % -> % no esta permitida', old.estado, new.estado;
    end if;
    if new.estado = 'COMPLETADO' then
      if v_total <= 0 or v_total < new.horas_minimas_requeridas then
        raise exception 'HORAS_INSUFICIENTES: % horas acumuladas, minimo requerido %', v_total, new.horas_minimas_requeridas;
      end if;
      new.completado_en := now();
    elsif new.estado = 'EN_PROCESO' then
      new.completado_en := null;
    elsif new.estado = 'PRESENTADO' then
      if new.soporte_documento_id is null then
        raise exception 'SOPORTE_REQUERIDO: presentar exige el documento LAB_SOC';
      end if;
      new.presentado_en := now();
    end if;
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cls_guard on public.certificado_labor_social;
create trigger trg_cls_guard before update or delete on public.certificado_labor_social
  for each row execute function public.fn_ls_certificado_guard();

drop trigger if exists trg_cls_actualizado_en on public.certificado_labor_social;

-- -----------------------------------------------------------------------------
-- 5. Configuracion
-- -----------------------------------------------------------------------------
insert into public.configuracion_sistema (clave, valor, tipo, categoria, descripcion, valor_defecto, valor_min, valor_max, pendiente_confirmar) values
  ('LABOR_SOCIAL_HORAS_MINIMAS', '0', 'INT', 'LABOR_SOCIAL', 'Horas minimas exigidas por periodo (sin definir)', '0', '0', '1000', true),
  ('LABOR_SOCIAL_HORAS_MAX_DIA', '8', 'INT', 'LABOR_SOCIAL', 'Horas maximas de labor social por dia, sumando todas las actividades de la fecha (a confirmar con el Acuerdo 023)', '8', '1', '24', true)
on conflict (clave) do nothing;

-- -----------------------------------------------------------------------------
-- 6. Verificacion publica: SOLO valido, tipo, generado_en y sha256. Sin datos personales.
--    Siempre devuelve una fila (valido=false con nulos si el codigo no existe).
-- -----------------------------------------------------------------------------
create or replace function public.fn_verificar_labor_social(p_codigo text)
returns table (valido boolean, tipo text, generado_en timestamptz, sha256 text)
language sql
stable
security definer
set search_path = public
as $$
  select (e.id is not null) as valido,
         case when e.id is not null then 'GE-F038' else null end as tipo,
         e.emitido_en,
         e.sha256_archivo
  from (select 1) base
  left join public.labor_social_emision e on e.codigo_verificacion = p_codigo;
$$;
revoke execute on function public.fn_verificar_labor_social(text) from public, anon, authenticated;
grant execute on function public.fn_verificar_labor_social(text) to service_role;

-- -----------------------------------------------------------------------------
-- 7. RLS
-- -----------------------------------------------------------------------------
-- Funcionario con asignacion ACTIVA sobre alguna postulacion del beneficiario (0016, opcional).
create or replace function public.fn_ls_funcionario_asignado(p_beneficiario_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regclass('public.postulacion_asignacion') is null then
    return false;
  end if;
  return exists (
    select 1
      from public.postulacion p
      join public.postulacion_asignacion a on a.postulacion_id = p.id
     where p.beneficiario_id = p_beneficiario_id
       and a.funcionario_id = auth.uid()
       and a.estado = 'ACTIVA'
  );
end;
$$;
revoke execute on function public.fn_ls_funcionario_asignado(uuid) from public, anon;
grant execute on function public.fn_ls_funcionario_asignado(uuid) to authenticated, service_role;

alter table public.certificado_labor_social enable row level security;
alter table public.actividad_labor_social   enable row level security;
alter table public.labor_social_emision     enable row level security;

drop policy if exists cls_select on public.certificado_labor_social;
create policy cls_select on public.certificado_labor_social for select to authenticated
  using (
    public.es_administrador()
    or (public.es_beneficiario() and public.es_mi_beneficiario(beneficiario_id))
    or (public.es_funcionario() and public.fn_ls_funcionario_asignado(beneficiario_id))
  );

-- El detalle de actividades lo ve el titular y el administrador (el funcionario solo ve el resumen).
drop policy if exists als_select on public.actividad_labor_social;
create policy als_select on public.actividad_labor_social for select to authenticated
  using (
    exists (
      select 1 from public.certificado_labor_social c
       where c.id = certificado_id
         and (public.es_administrador() or (public.es_beneficiario() and public.es_mi_beneficiario(c.beneficiario_id)))
    )
  );

drop policy if exists lse_select on public.labor_social_emision;
create policy lse_select on public.labor_social_emision for select to authenticated
  using (
    exists (
      select 1 from public.certificado_labor_social c
       where c.id = certificado_id
         and (public.es_administrador() or (public.es_beneficiario() and public.es_mi_beneficiario(c.beneficiario_id)))
    )
  );

revoke all on public.certificado_labor_social, public.actividad_labor_social, public.labor_social_emision from anon, authenticated;
grant select on public.certificado_labor_social, public.actividad_labor_social, public.labor_social_emision to authenticated;
grant all on public.certificado_labor_social, public.actividad_labor_social, public.labor_social_emision to service_role;

-- -----------------------------------------------------------------------------
-- 8. Bucket privado `formatos` (lo comparte formatos_oficiales). Claves: labor-social/<certificado_id>/...
--    El acceso es por URL firmada de service_role (300 s).
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

-- Fin de 0019_labor_social.sql
