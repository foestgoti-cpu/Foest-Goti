import type { RutasModulo } from '../index';
import { ConvocatoriasPublicasPage } from './pages/ConvocatoriasPublicasPage';
import { ConvocatoriaPublicaDetallePage } from './pages/ConvocatoriaPublicaDetallePage';
import { ConvocatoriasAdminPage } from './pages/ConvocatoriasAdminPage';
import { ConvocatoriaNuevaPage } from './pages/ConvocatoriaNuevaPage';
import { ConvocatoriaAdminDetallePage } from './pages/ConvocatoriaAdminDetallePage';
import { ConvocatoriaFuncionarioDetallePage, ConvocatoriasFuncionarioPage } from './pages/ConvocatoriasFuncionarioPage';

/**
 * Rutas del modulo convocatorias.
 *  - Publicas: `/convocatorias` (listado de convocatorias abiertas) y `/convocatorias/:id`.
 *  - Admin: `/admin/convocatorias`, `/admin/convocatorias/nueva`, `/admin/convocatorias/:id`.
 *  - Funcionario: `/funcionario/convocatorias` y `/funcionario/convocatorias/:id` (solo lectura).
 */
export const convocatoriasRoutes: RutasModulo = {
  rutasPublicas: [
    { path: 'convocatorias', element: <ConvocatoriasPublicasPage /> },
    { path: 'convocatorias/:id', element: <ConvocatoriaPublicaDetallePage /> },
  ],
  rutasAdmin: [
    { path: 'convocatorias', element: <ConvocatoriasAdminPage /> },
    { path: 'convocatorias/nueva', element: <ConvocatoriaNuevaPage /> },
    { path: 'convocatorias/:id', element: <ConvocatoriaAdminDetallePage /> },
  ],
  rutasFuncionario: [
    { path: 'convocatorias', element: <ConvocatoriasFuncionarioPage /> },
    { path: 'convocatorias/:id', element: <ConvocatoriaFuncionarioDetallePage /> },
  ],
};
