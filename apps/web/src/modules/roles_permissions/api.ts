import { api } from '../../lib/api';
import type { MatrizPermisos, PermisoItem, PermisosDeRol, PermisosMios, RolItem } from './types';

/** Cliente HTTP del modulo roles_permissions (solo lectura). */
export const rolesPermissionsApi = {
  listarRoles: () => api.get<{ data: RolItem[] }>('/roles'),
  permisosDeRol: (id: string) => api.get<PermisosDeRol>(`/roles/${encodeURIComponent(id)}/permisos`),
  catalogoPermisos: () => api.get<{ data: PermisoItem[] }>('/permisos'),
  matriz: () => api.get<MatrizPermisos>('/permisos/matriz'),
  permisosMios: () => api.get<PermisosMios>('/permisos/mios'),
};
