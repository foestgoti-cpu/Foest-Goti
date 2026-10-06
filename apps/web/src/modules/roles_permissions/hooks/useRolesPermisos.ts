import { useQuery } from '@tanstack/react-query';
import { rolesPermissionsApi } from '../api';

export function useRoles() {
  return useQuery({
    queryKey: ['roles_permissions', 'roles'],
    queryFn: () => rolesPermissionsApi.listarRoles(),
  });
}

export function useMatrizPermisos() {
  return useQuery({
    queryKey: ['roles_permissions', 'matriz'],
    queryFn: () => rolesPermissionsApi.matriz(),
  });
}

export function usePermisosDeRol(id: string | null) {
  return useQuery({
    queryKey: ['roles_permissions', 'rol', id],
    queryFn: () => rolesPermissionsApi.permisosDeRol(id as string),
    enabled: Boolean(id),
  });
}
