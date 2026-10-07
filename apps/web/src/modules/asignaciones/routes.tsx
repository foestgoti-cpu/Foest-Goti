import type { RutasModulo } from '../index';
import { BandejaPage } from './pages/BandejaPage';
import { AsignacionesAdminPage } from './pages/AsignacionesAdminPage';

/** Rutas del modulo asignaciones (docs/modules/asignaciones.md). */
export const asignacionesRoutes: RutasModulo = {
  rutasFuncionario: [{ path: 'bandeja', element: <BandejaPage /> }],
  rutasAdmin: [{ path: 'asignaciones', element: <AsignacionesAdminPage /> }],
};
