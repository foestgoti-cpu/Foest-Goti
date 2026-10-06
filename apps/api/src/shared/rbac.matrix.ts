import type { RequestHandler } from 'express';
import { MATRIZ_PERMISOS, PERMISOS, type Permiso, type Rol } from '@foest/shared';
import { AppError } from './errors';
import './types';

/**
 * Matriz rol -> permisos (fuente: docs/modules/roles_permissions.md).
 * La definicion vive en `@foest/shared` (MATRIZ_PERMISOS) para que web y api
 * compartan exactamente la misma tabla; aqui se expone con utilidades de
 * servidor. El seed SQL de `rol_permiso` (supabase/migrations/0001_base.sql)
 * replica esta matriz y una prueba verifica que coincidan.
 */
export const RBAC_MATRIX: Readonly<Record<Rol, readonly Permiso[]>> = MATRIZ_PERMISOS;
export const CATALOGO_PERMISOS = PERMISOS;

/** Cache en memoria (Set por rol) para resolucion O(1). */
const cache = new Map<Rol, Set<Permiso>>();
function permisosDe(rol: Rol): Set<Permiso> {
  let set = cache.get(rol);
  if (!set) {
    set = new Set(RBAC_MATRIX[rol]);
    cache.set(rol, set);
  }
  return set;
}

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return permisosDe(rol).has(permiso);
}

export function permisosDelRol(rol: Rol): Permiso[] {
  return [...permisosDe(rol)];
}

/**
 * `requirePermission(codigo)`: 403 si el rol no tiene el permiso.
 * Debe ir SIEMPRE despues de `authenticate()`. El alcance (recurso ajeno -> 404)
 * lo verifica cada modulo en su servicio/middleware propio.
 */
export function requirePermission(...codigos: Permiso[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) return next(AppError.noAutenticado());
    const ok = codigos.every((c) => tienePermiso(user.rol, c));
    if (!ok) return next(AppError.sinPermiso());
    return next();
  };
}

/** Variante: basta con tener alguno de los permisos indicados. */
export function requireAnyPermission(...codigos: Permiso[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) return next(AppError.noAutenticado());
    const ok = codigos.some((c) => tienePermiso(user.rol, c));
    if (!ok) return next(AppError.sinPermiso());
    return next();
  };
}
