import type { RutasModulo } from '../index';
import { ReportesPage } from './pages/ReportesPage';

/** Rutas del modulo export_reports: `/admin/reportes` y `/funcionario/reportes`. */
export const exportReportsRoutes: RutasModulo = {
  rutasAdmin: [{ path: 'reportes', element: <ReportesPage /> }],
  rutasFuncionario: [{ path: 'reportes', element: <ReportesPage /> }],
};
