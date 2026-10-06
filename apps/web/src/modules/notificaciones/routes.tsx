import type { RutasModulo } from '../index';
import { NotificacionesAdminPage, NotificacionesFuncionarioPage } from './pages/NotificacionesRolPage';
import { PreferenciasBeneficiarioPage } from './pages/PreferenciasBeneficiarioPage';
import { EntregasCorreoPage } from './pages/EntregasCorreoPage';

/**
 * Modulo notificaciones:
 *   /beneficiario/notificaciones/preferencias  preferencias de correo (el buzon y la campana viven en beneficiario_dashboard)
 *   /funcionario/notificaciones                centro de notificaciones + preferencias
 *   /admin/notificaciones                      centro de notificaciones + preferencias
 *   /admin/notificaciones/entregas             bandeja de salida, entregas y rebotes
 */
export const notificacionesRoutes: RutasModulo = {
  rutasBeneficiario: [{ path: 'notificaciones/preferencias', element: <PreferenciasBeneficiarioPage /> }],
  rutasFuncionario: [{ path: 'notificaciones', element: <NotificacionesFuncionarioPage /> }],
  rutasAdmin: [
    { path: 'notificaciones', element: <NotificacionesAdminPage /> },
    { path: 'notificaciones/entregas', element: <EntregasCorreoPage /> },
  ],
};
