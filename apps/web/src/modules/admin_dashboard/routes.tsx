import type { RutasModulo } from '../index';
import { AdminPanelPage } from './pages/AdminPanelPage';

/**
 * Modulo admin_dashboard: panel gerencial (/admin). Sustituye el placeholder
 * del indice de /admin. El visor de auditoria (/admin/auditoria) vive en
 * modules/auditoria; configuracion y festivos (/admin/configuracion, /admin/festivos)
 * en modules/catalogos_configuracion.
 */
export const adminDashboardRoutes: RutasModulo = {
  rutasAdmin: [{ index: true, element: <AdminPanelPage /> }],
};
