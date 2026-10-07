-- =============================================================================
-- 0020_export_reports.sql - Modulo export_reports (docs/modules/export_reports.md)
-- Idempotente. Asume aplicadas 0001..0013 (usuario, convocatoria, es_administrador, fn_set_actualizado_en).
--
-- Contenido:
--   1. reporte_generado   trabajos de exportacion (consolidados XLSX/CSV; el resumen PDF no se almacena)
--   2. RLS                cada usuario ve sus reportes; el administrador ve todos; escrituras solo service_role
--   3. Bucket privado `reportes` de Supabase Storage (sin politicas de lectura: solo URL firmada de 120 s)
--   4. Permiso reportes:exportar_sensible y su asignacion (solo ADMINISTRADOR)
--   5. Claves de configuracion REPORTE_UMBRAL_SINCRONO (200) y REPORTE_RETENCION_HORAS (24)
--
-- Compatibilidad: 0009_admin_dashboard.sql (fn_admin_alertas) lee reporte_generado.estado = 'FALLIDO'
-- y reporte_generado.actualizado_en; ambas columnas existen aqui con esos nombres.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. reporte_generado
-- -----------------------------------------------------------------------------
create table if not exists public.reporte_generado (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references public.usuario(id),
  tipo              text not null check (tipo in ('RESUMEN_PDF', 'CONSOLIDADO_XLSX', 'CONSOLIDADO_CSV')),
  convocatoria_id   uuid references public.convocatoria(id) on delete set null,
  -- Parametros normalizados de la solicitud: { formato, filtros }. Nunca contiene datos personales.
  parametros        jsonb not null default '{}'::jsonb,
  -- Huella (sha256 hex) de usuario + tipo + convocatoria + filtros normalizados: detecta duplicados en curso.
  huella_parametros text not null check (huella_parametros ~ '^[0-9a-f]{64}$'),
  estado            text not null default 'COLA' check (estado in ('COLA', 'PROCESANDO', 'LISTO', 'FALLIDO', 'EXPIRADO')),
  incluye_sensibles boolean not null default false,
  filas_total       integer check (filas_total is null or filas_total >= 0),
  storage_key       text,
  nombre_archivo    text,
  sha256            text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  tamano_bytes      bigint check (tamano_bytes is null or tamano_bytes >= 0),
  intentos          integer not null default 0 check (intentos >= 0),
  -- Codigo generico del fallo (sin datos personales ni trazas).
  error             text,
  expira_en         timestamptz,
  notificado_en     timestamptz,
  creado_en         timestamptz not null default now(),
  iniciado_en       timestamptz,
  finalizado_en     timestamptz,
  actualizado_en    timestamptz not null default now(),
  constraint ck_reporte_listo_completo check (
    estado <> 'LISTO' or (storage_key is not null and sha256 is not null and tamano_bytes is not null and expira_en is not null)
  )
);
comment on table public.reporte_generado is 'Trabajos de exportacion (export_reports). Solo escribe la API (service_role). El archivo vive en el bucket privado `reportes`.';
comment on column public.reporte_generado.huella_parametros is 'sha256(usuario|tipo|convocatoria|filtros normalizados); impide dos trabajos iguales en curso (REPORTE_EN_CURSO).';

-- Un solo trabajo en curso por huella (usuario + parametros): REPORTE_EN_CURSO.
create unique index if not exists uq_reporte_en_curso
  on public.reporte_generado (huella_parametros)
  where estado in ('COLA', 'PROCESANDO');
create index if not exists ix_reporte_usuario on public.reporte_generado (usuario_id, creado_en desc);
create index if not exists ix_reporte_cola on public.reporte_generado (creado_en) where estado = 'COLA';
create index if not exists ix_reporte_expira on public.reporte_generado (expira_en) where estado = 'LISTO';
create index if not exists ix_reporte_fallidos on public.reporte_generado (actualizado_en) where estado = 'FALLIDO';

drop trigger if exists trg_reporte_generado_actualizado_en on public.reporte_generado;
create trigger trg_reporte_generado_actualizado_en before update on public.reporte_generado
  for each row execute function public.fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- 2. RLS: cada usuario ve sus reportes; el administrador ve todos. Escrituras: service_role.
-- -----------------------------------------------------------------------------
alter table public.reporte_generado enable row level security;

drop policy if exists reporte_generado_select on public.reporte_generado;
create policy reporte_generado_select on public.reporte_generado
  for select to authenticated
  using (usuario_id = auth.uid() or public.es_administrador());

revoke insert, update, delete, truncate on public.reporte_generado from anon, authenticated;
revoke select on public.reporte_generado from anon;

-- -----------------------------------------------------------------------------
-- 3. Storage: bucket privado `reportes`; clave `<usuario_id>/<reporte_id>.<ext>`.
--    Sin politicas para authenticated: la descarga es solo por URL firmada de service_role.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('reportes', 'reportes', false)
    on conflict (id) do update set public = false;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Permiso reportes:exportar_sensible (estrato, SISBEN y documento en consolidados): solo ADMINISTRADOR.
--    Debe coincidir con PERMISOS / MATRIZ_PERMISOS de packages/shared/src/permisos.ts.
-- -----------------------------------------------------------------------------
insert into public.permiso (codigo, categoria, alcance, descripcion) values
  ('reportes:exportar_sensible', 'REPORTES', 'GLOBAL', 'Incluir estrato, SISBEN y documento en consolidados')
on conflict (codigo) do update
  set categoria = excluded.categoria, alcance = excluded.alcance, descripcion = excluded.descripcion;

-- BEGIN SEED rol_permiso (0020)
insert into public.rol_permiso (rol_id, permiso_id)
select r.id, p.id
from (values
  ('ADMINISTRADOR', 'reportes:exportar_sensible')
) as v(rol, permiso)
join public.rol r on r.nombre::text = v.rol
join public.permiso p on p.codigo = v.permiso
on conflict do nothing;
-- END SEED rol_permiso (0020)

-- -----------------------------------------------------------------------------
-- 5. Configuracion
-- -----------------------------------------------------------------------------
insert into public.configuracion_sistema (clave, valor, tipo, categoria, descripcion, valor_defecto, valor_min, valor_max, pendiente_confirmar) values
  ('REPORTE_UMBRAL_SINCRONO', '200', 'INT', 'PLAZOS', 'Maximo de expedientes para generar un consolidado dentro de la peticion; por encima se encola', '200', '1', '5000', false),
  ('REPORTE_RETENCION_HORAS', '24', 'INT', 'PLAZOS', 'Horas que se conserva un reporte generado antes de purgarse', '24', '1', '168', false)
on conflict (clave) do nothing;
