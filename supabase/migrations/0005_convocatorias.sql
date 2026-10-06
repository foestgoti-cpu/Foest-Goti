-- =============================================================================
-- FOEST - Migracion 0005_convocatorias
-- Complementa 0001_base.sql (las tablas convocatoria, convocatoria_beneficio,
-- ampliacion_convocatoria, convocatoria_cambio_estado, asignacion_funcionario y
-- beneficio YA existen alli). Idempotente. Asume 0001_base.sql aplicada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ARCHIVADA es terminal: ninguna transicion sale de ella (servicio + trigger).
-- -----------------------------------------------------------------------------
create or replace function public.fn_convocatoria_estado_terminal()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'ARCHIVADA' and new.estado is distinct from old.estado then
    raise exception 'TRANSICION_INVALIDA: la convocatoria % esta ARCHIVADA (estado terminal)', old.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_convocatoria_estado_terminal on public.convocatoria;
create trigger trg_convocatoria_estado_terminal before update of estado on public.convocatoria
  for each row execute function public.fn_convocatoria_estado_terminal();

-- -----------------------------------------------------------------------------
-- 2. La version solo avanza (bloqueo optimista): no se permite retroceder.
-- -----------------------------------------------------------------------------
create or replace function public.fn_convocatoria_version_monotona()
returns trigger
language plpgsql
as $$
begin
  if new.version < old.version then
    raise exception 'VERSION_DESACTUALIZADA: la version de la convocatoria % no puede retroceder (% -> %)', old.id, old.version, new.version
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_convocatoria_version_monotona on public.convocatoria;
create trigger trg_convocatoria_version_monotona before update on public.convocatoria
  for each row execute function public.fn_convocatoria_version_monotona();

-- -----------------------------------------------------------------------------
-- 3. Indices para los jobs (cierre cada minuto y recordatorio diario).
-- -----------------------------------------------------------------------------
create index if not exists ix_convocatoria_cierre_pendiente
  on public.convocatoria (fecha_cierre_exclusiva)
  where estado in ('HABILITADA', 'SUSPENDIDA');

create index if not exists ix_convocatoria_recordatorio_cierre
  on public.convocatoria (fecha_cierre_exclusiva)
  where estado = 'HABILITADA' and recordatorio_cierre_enviado_en is null;

create index if not exists ix_postulacion_convocatoria_en_curso
  on public.postulacion (convocatoria_id)
  where estado in ('BORRADOR', 'PENDIENTE', 'EN_EVALUACION', 'EN_CORRECCION');

-- -----------------------------------------------------------------------------
-- 4. Historial de ampliaciones y cambios de estado: append-only.
-- -----------------------------------------------------------------------------
drop trigger if exists trg_ampliacion_inmutable on public.ampliacion_convocatoria;
create trigger trg_ampliacion_inmutable before update or delete on public.ampliacion_convocatoria
  for each row execute function public.fn_bloquear_modificacion();

drop trigger if exists trg_cambio_estado_inmutable on public.convocatoria_cambio_estado;
create trigger trg_cambio_estado_inmutable before update or delete on public.convocatoria_cambio_estado
  for each row execute function public.fn_bloquear_modificacion();

-- -----------------------------------------------------------------------------
-- 5. Funcion de solo lectura para el detalle: conteo de postulaciones por estado
--    (la API tambien lo calcula; esta funcion sirve a reportes y dashboards).
-- -----------------------------------------------------------------------------
create or replace function public.fn_convocatoria_postulaciones_por_estado(p_convocatoria_id uuid)
returns table (estado text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.estado::text, count(*)
  from public.postulacion p
  where p.convocatoria_id = p_convocatoria_id
  group by p.estado;
$$;
revoke all on function public.fn_convocatoria_postulaciones_por_estado(uuid) from public, anon;
grant execute on function public.fn_convocatoria_postulaciones_por_estado(uuid) to authenticated;

-- Fin de 0005_convocatorias.sql
