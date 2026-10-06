import type { ReactNode } from 'react';
import type { Permiso, Rol } from '@foest/shared';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Muestra `children` solo si el usuario cumple el rol y/o los permisos indicados.
 * Es ergonomia de interfaz (ocultar opciones); NO es seguridad: la API vuelve a
 * verificar cada peticion (DECISIONES section 2).
 *
 *   <RoleGuard permisos={['postulacion:aprobar']}>...</RoleGuard>
 *   <RoleGuard roles={['ADMINISTRADOR']} fallback={<p>No disponible</p>}>...</RoleGuard>
 *   <RoleGuard permisos={['a:x', 'b:y']} modo="alguno">...</RoleGuard>
 */
export interface RoleGuardProps {
  roles?: Rol[];
  permisos?: Permiso[];
  /** `todos` (por defecto): exige todos los permisos; `alguno`: basta con uno. */
  modo?: 'todos' | 'alguno';
  /** Contenido alternativo cuando no se cumple la condicion (por defecto nada). */
  fallback?: ReactNode;
  /** Contenido mientras se cargan los permisos del servidor (por defecto se evalua con la copia local). */
  cargando?: ReactNode;
  children: ReactNode;
}

export function RoleGuard({ roles, permisos, modo = 'todos', fallback = null, cargando, children }: RoleGuardProps) {
  const p = usePermissions();

  if (cargando !== undefined && p.cargando) return <>{cargando}</>;

  if (roles && roles.length > 0 && (!p.rol || !roles.includes(p.rol))) return <>{fallback}</>;

  if (permisos && permisos.length > 0) {
    const ok = modo === 'alguno' ? p.canAny(...permisos) : p.can(...permisos);
    if (!ok) return <>{fallback}</>;
  }

  return <>{children}</>;
}
