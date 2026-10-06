import type { RutasModulo } from '../index';
import { RolesPage } from './pages/RolesPage';
import { MatrizPermisosPage } from './pages/MatrizPermisosPage';

/** Modulo roles_permissions: vistas administrativas de solo lectura bajo /admin. */
export const rolesPermissionsRoutes: RutasModulo = {
  rutasAdmin: [
    { path: 'roles', element: <RolesPage /> },
    { path: 'roles/matriz', element: <MatrizPermisosPage /> },
  ],
};
