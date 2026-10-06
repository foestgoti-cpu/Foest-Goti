-- =============================================================================
-- 0004_roles_permissions.sql - Modulo roles_permissions (docs/modules/roles_permissions.md)
--
-- Las tablas rol / permiso / rol_permiso, sus politicas RLS (lectura para
-- `authenticated`) y la matriz completa ya existen en 0001_base.sql. Esta
-- migracion solo agrega, de forma idempotente, el permiso de seguridad
-- `rol:consultar` (consulta de roles, catalogo de permisos y matriz) para las
-- bases donde 0001 se aplico antes de incorporarlo. Debe coincidir con
-- PERMISOS / MATRIZ_PERMISOS de packages/shared/src/permisos.ts.
-- =============================================================================

insert into public.permiso (codigo, categoria, alcance, descripcion) values
  ('rol:consultar', 'SEGURIDAD', 'GLOBAL', 'Consultar roles, catalogo de permisos y matriz rol x permiso')
on conflict (codigo) do update
  set categoria = excluded.categoria, alcance = excluded.alcance, descripcion = excluded.descripcion;

insert into public.rol_permiso (rol_id, permiso_id)
select r.id, p.id
from public.rol r
join public.permiso p on p.codigo = 'rol:consultar'
where r.nombre::text = 'ADMINISTRADOR'
on conflict do nothing;

-- Los tres roles base son inmutables (no hay endpoints de escritura): se
-- garantiza la marca es_base por si alguna carga manual la hubiera alterado.
update public.rol set es_base = true where es_base is distinct from true;
