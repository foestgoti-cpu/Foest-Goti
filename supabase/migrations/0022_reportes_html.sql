-- =============================================================================
-- 0022_reportes_html.sql
-- Modulo: export_reports. El consolidado deja de generarse como XLSX y pasa a HTML.
--
-- Que hace:
--   * Sustituye el CHECK de `reporte_generado.tipo` (definido en linea en 0020) por uno nombrado
--     `ck_reporte_generado_tipo` que acepta ('RESUMEN_PDF','CONSOLIDADO_HTML','CONSOLIDADO_CSV','CONSOLIDADO_XLSX').
--     CONSOLIDADO_XLSX se conserva SOLO por compatibilidad con filas historicas; la API ya no lo solicita.
--   * No borra ni convierte filas existentes. La huella de parametros y el indice uq_reporte_en_curso
--     no dependen del valor del tipo (el tipo entra al hash en la API), por lo que no se tocan.
--
-- Orden: se aplica DESPUES de 0021. Idempotente y repetible.
-- =============================================================================

do $$
declare
  r record;
begin
  -- Elimina cualquier CHECK de reporte_generado que mencione CONSOLIDADO_XLSX (el de 0020 con nombre
  -- autogenerado o el propio de esta migracion en una reejecucion).
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.reporte_generado'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%CONSOLIDADO_XLSX%'
  loop
    execute format('alter table public.reporte_generado drop constraint %I', r.conname);
  end loop;
end
$$;

alter table public.reporte_generado
  add constraint ck_reporte_generado_tipo
  check (tipo in ('RESUMEN_PDF', 'CONSOLIDADO_HTML', 'CONSOLIDADO_CSV', 'CONSOLIDADO_XLSX'));

comment on constraint ck_reporte_generado_tipo on public.reporte_generado is 'CONSOLIDADO_XLSX es legado (solo filas historicas); los nuevos consolidados son CONSOLIDADO_HTML o CONSOLIDADO_CSV.';
