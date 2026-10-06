import type { RutasModulo } from '../index';
import { AuditoriaPage } from './pages/AuditoriaPage';

/** Modulo auditoria: visor de la bitacora en /admin/auditoria (entrada ya prevista en navigation.ts). */
export const auditoriaRoutes: RutasModulo = {
  rutasAdmin: [{ path: 'auditoria', element: <AuditoriaPage /> }],
};
