import type { RutasModulo } from '../index';
import { FormatosPostulacionPage } from './pages/FormatosPostulacionPage';
import { VerificarDocumentoPage } from './pages/VerificarDocumentoPage';

/**
 * Rutas del modulo formatos_oficiales.
 *  - Beneficiario: `/beneficiario/postulaciones/:id/formatos`.
 *  - Publicas: `/verificar` y `/verificar/:codigo` (sin sesion).
 */
export const formatosOficialesRoutes: RutasModulo = {
  rutasBeneficiario: [{ path: 'postulaciones/:id/formatos', element: <FormatosPostulacionPage /> }],
  rutasPublicas: [
    { path: 'verificar', element: <VerificarDocumentoPage /> },
    { path: 'verificar/:codigo', element: <VerificarDocumentoPage /> },
  ],
};
