import type { RutasModulo } from '../index';
import { EjemploPage } from './pages/EjemploPage';

/**
 * Modulo de EJEMPLO. Estructura por modulo:
 *   src/modules/<modulo>/{routes.tsx, pages/, components/, hooks/, api.ts, types.ts}
 */
export const ejemploRoutes: RutasModulo = {
  rutasBeneficiario: [{ path: 'ejemplo', element: <EjemploPage /> }],
  rutasFuncionario: [{ path: 'ejemplo', element: <EjemploPage /> }],
  rutasAdmin: [{ path: 'ejemplo', element: <EjemploPage /> }],
};
