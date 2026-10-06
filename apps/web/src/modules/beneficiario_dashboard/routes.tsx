import type { RutasModulo } from '../index';
import { BeneficiarioHomePage } from './pages/BeneficiarioHomePage';
import { NotificacionesPage } from './pages/NotificacionesPage';

/**
 * Modulo beneficiario_dashboard:
 *   /beneficiario                 panel principal (sustituye el placeholder del arquitecto)
 *   /beneficiario/notificaciones  centro de notificaciones
 */
export const beneficiarioDashboardRoutes: RutasModulo = {
  rutasBeneficiario: [
    { index: true, element: <BeneficiarioHomePage /> },
    { path: 'notificaciones', element: <NotificacionesPage /> },
  ],
};

export { NotificacionesCampana } from './components/NotificacionesCampana';
