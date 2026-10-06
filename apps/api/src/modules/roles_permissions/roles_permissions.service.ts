import { PERMISOS, ROLES, RolSchema, type Permiso, type Rol } from '@foest/shared';
import { AppError, permisosDelRol, supabaseAsUser, tienePermiso, type UsuarioAutenticado } from '../../shared';
import { hasSupabaseCredentials } from '../../config/env';
import { DESCRIPCION_ROL, ORDEN_CATEGORIAS, metaDe } from './roles_permissions.catalogo';
import type { FilaMatriz, MatrizPermisos, PermisoItem, PermisosDeRol, PermisosMios, RolItem } from './roles_permissions.types';

/**
 * Servicio de roles y permisos (solo lectura).
 *
 * La fuente de verdad en runtime es MATRIZ_PERMISOS de @foest/shared (DECISIONES
 * section 19: permisos calculados en servidor, nunca en el JWT). Las tablas
 * `rol` / `permiso` / `rol_permiso` de Supabase son la replica persistida (seed
 * idempotente de 0001_base.sql) y sirven como segunda barrera RLS; la prueba
 * del modulo verifica que coincidan con la matriz TS.
 */
function ordenCategoria(categoria: string): number {
  const i = ORDEN_CATEGORIAS.indexOf(categoria);
  return i === -1 ? ORDEN_CATEGORIAS.length : i;
}

function permisoItem(codigo: Permiso): PermisoItem {
  const meta = metaDe(codigo);
  return {
    codigo,
    descripcion: meta.descripcion,
    categoria: meta.categoria,
    alcance: meta.alcance,
    regla_alcance: meta.regla_alcance,
  };
}

function ordenarPermisos<T extends PermisoItem>(items: T[]): T[] {
  // Orden estable: categoria (segun la matriz oficial) y, dentro, orden de declaracion en PERMISOS.
  const posicion = new Map<Permiso, number>(PERMISOS.map((p, i) => [p, i]));
  return [...items].sort((a, b) => {
    const c = ordenCategoria(a.categoria) - ordenCategoria(b.categoria);
    if (c !== 0) return c;
    return (posicion.get(a.codigo) ?? 0) - (posicion.get(b.codigo) ?? 0);
  });
}

function rolItem(rol: Rol): RolItem {
  return {
    id: rol,
    nombre: rol,
    descripcion: DESCRIPCION_ROL[rol],
    es_base: true,
    total_permisos: permisosDelRol(rol).length,
  };
}

/**
 * Resuelve `:id` (nombre o uuid) a un rol base. Un uuid solo se puede resolver
 * contra `public.rol` con el token del usuario (RLS: lectura para autenticados);
 * si no existe o no hay credenciales -> 404 (no se revela nada mas).
 */
async function resolverRol(user: UsuarioAutenticado, id: string): Promise<Rol> {
  const porNombre = RolSchema.safeParse(id);
  if (porNombre.success) return porNombre.data;
  if (!hasSupabaseCredentials()) throw AppError.noEncontrado('ROL_NO_ENCONTRADO', 'Rol no encontrado');
  const db = supabaseAsUser(user.token);
  const { data, error } = await db.from('rol').select('nombre').eq('id', id).maybeSingle();
  if (error) throw AppError.interno(`No fue posible consultar el rol: ${error.message}`);
  const nombre = RolSchema.safeParse(data?.nombre);
  if (!nombre.success) throw AppError.noEncontrado('ROL_NO_ENCONTRADO', 'Rol no encontrado');
  return nombre.data;
}

export const rolesPermissionsService = {
  listarRoles(): RolItem[] {
    return ROLES.map(rolItem);
  },

  async permisosDeRol(user: UsuarioAutenticado, id: string): Promise<PermisosDeRol> {
    const rol = await resolverRol(user, id);
    return { rol: rolItem(rol), permisos: ordenarPermisos(permisosDelRol(rol).map(permisoItem)) };
  },

  catalogoPermisos(): PermisoItem[] {
    return ordenarPermisos(PERMISOS.map(permisoItem));
  },

  matriz(): MatrizPermisos {
    const filas: FilaMatriz[] = ordenarPermisos(
      PERMISOS.map((codigo) => ({
        ...permisoItem(codigo),
        roles: Object.fromEntries(ROLES.map((r) => [r, tienePermiso(r, codigo)])) as Record<Rol, boolean>,
      })),
    );
    const categorias = [...new Set(filas.map((f) => f.categoria))];
    return { roles: ROLES.map(rolItem), categorias, filas };
  },

  /** Permisos efectivos del usuario en sesion, calculados desde la matriz (nunca desde el JWT). */
  permisosMios(user: UsuarioAutenticado): PermisosMios {
    return { usuario_id: user.id, rol: user.rol, permisos: permisosDelRol(user.rol) };
  },
};
