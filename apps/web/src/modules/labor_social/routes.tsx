import type { RutasModulo } from '../index';
import { LaborSocialPage } from './pages/LaborSocialPage';

/** Rutas del modulo labor_social: `/beneficiario/labor-social`. */
export const laborSocialRoutes: RutasModulo = {
  rutasBeneficiario: [{ path: 'labor-social', element: <LaborSocialPage /> }],
};
