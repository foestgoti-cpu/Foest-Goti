import type { RutasModulo } from '../index';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { AuditoriaPage } from './pages/AuditoriaPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { FestivosPage } from './pages/FestivosPage';

/**
 * Modulo admin_dashboard: panel gerencial (/admin), visor de auditoria
 * (/admin/auditoria), editor de configuracion (/admin/configuracion) y festivos
 * (/admin/festivos). Sustituye el placeholder del indice de /admin.
 */
export const adminDashboardRoutes: RutasModulo = {
  rutasAdmin: [
    { index: true, element: <AdminPanelPage /> },
    { path: 'auditoria', element: <AuditoriaPage /> },
    { path: 'configuracion', element: <ConfiguracionPage /> },
    { path: 'festivos', element: <FestivosPage /> },
  ],
};
