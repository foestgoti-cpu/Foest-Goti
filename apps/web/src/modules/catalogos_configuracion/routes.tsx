import type { RutasModulo } from '../index';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { FestivosPage } from './pages/FestivosPage';
import { SniesPage } from './pages/SniesPage';
import { DeclaracionesPage } from './pages/DeclaracionesPage';

/**
 * Modulo catalogos_configuracion (solo ADMINISTRADOR):
 *   /admin/configuracion            parametros del sistema
 *   /admin/festivos                 calendario de festivos y dias habiles
 *   /admin/catalogos/snies          importacion y consulta del catalogo SNIES
 *   /admin/catalogos/declaraciones  declaraciones juramentadas y consentimiento versionados
 */
export const catalogosConfiguracionRoutes: RutasModulo = {
  rutasAdmin: [
    { path: 'configuracion', element: <ConfiguracionPage /> },
    { path: 'festivos', element: <FestivosPage /> },
    { path: 'catalogos/snies', element: <SniesPage /> },
    { path: 'catalogos/declaraciones', element: <DeclaracionesPage /> },
  ],
};
