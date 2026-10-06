import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MATRIZ_PERMISOS, type Permiso, type Rol } from '@foest/shared';
import { useAuth } from '../../../lib/auth/AuthProvider';
import { rolesPermissionsApi } from '../api';

/**
 * Permisos efectivos del usuario en sesion.
 *
 *   const { can, canAny, permisos, rol, cargando } = usePermissions();
 *   if (can('postulacion:aprobar')) ...
 *
 * Fuente: `GET /api/v1/permisos/mios` (calculados en el servidor desde la matriz,
 * nunca desde el JWT). Mientras la consulta carga, o si falla, se usa la copia
 * de MATRIZ_PERMISOS de @foest/shared para el rol de `app_metadata` (misma
 * tabla). Es SOLO ergonomia de interfaz: la autorizacion real la hace la API
 * (403 por rol, 404 por recurso ajeno).
 */
export interface Permissions {
  rol: Rol | null;
  permisos: readonly Permiso[];
  /** `true` si el rol tiene TODOS los permisos indicados. */
  can: (...permisos: Permiso[]) => boolean;
  /** `true` si el rol tiene ALGUNO de los permisos indicados. */
  canAny: (...permisos: Permiso[]) => boolean;
  /** `true` mientras no se han recibido los permisos del servidor. */
  cargando: boolean;
  /** `true` si la lista proviene del servidor (no de la copia local). */
  desdeServidor: boolean;
}

export const CLAVE_PERMISOS_MIOS = ['roles_permissions', 'permisos', 'mios'] as const;

export function usePermissions(): Permissions {
  const { session, user, rol } = useAuth();
  const habilitado = Boolean(session && user);

  const consulta = useQuery({
    queryKey: [...CLAVE_PERMISOS_MIOS, user?.id ?? 'anonimo'],
    queryFn: () => rolesPermissionsApi.permisosMios(),
    enabled: habilitado,
    staleTime: 5 * 60 * 1000,
  });

  const permisos = useMemo<readonly Permiso[]>(() => {
    if (consulta.data) return consulta.data.permisos;
    return rol ? MATRIZ_PERMISOS[rol] : [];
  }, [consulta.data, rol]);

  const conjunto = useMemo(() => new Set<Permiso>(permisos), [permisos]);

  const can = useCallback((...codigos: Permiso[]) => codigos.length > 0 && codigos.every((c) => conjunto.has(c)), [conjunto]);
  const canAny = useCallback((...codigos: Permiso[]) => codigos.some((c) => conjunto.has(c)), [conjunto]);

  return {
    rol: consulta.data?.rol ?? rol,
    permisos,
    can,
    canAny,
    cargando: habilitado && consulta.isPending,
    desdeServidor: Boolean(consulta.data),
  };
}
