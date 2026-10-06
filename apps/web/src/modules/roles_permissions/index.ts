/**
 * API publica del modulo roles_permissions para los demas modulos del web:
 *
 *   import { RoleGuard, usePermissions } from '../roles_permissions';
 *
 *   const { can } = usePermissions();
 *   <RoleGuard permisos={['convocatoria:crear']}><Button>Nueva convocatoria</Button></RoleGuard>
 */
export { RoleGuard, type RoleGuardProps } from './components/RoleGuard';
export { usePermissions, CLAVE_PERMISOS_MIOS, type Permissions } from './hooks/usePermissions';
export { rolesPermissionsApi } from './api';
export type { PermisosMios, RolItem, PermisoItem, MatrizPermisos } from './types';
