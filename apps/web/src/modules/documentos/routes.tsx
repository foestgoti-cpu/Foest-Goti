import type { RutasModulo } from '../index';
import { DocumentosPostulacionPage } from './pages/DocumentosPostulacionPage';

/** Rutas del modulo documentos (docs/modules/documentos.md). */
export const documentosRoutes: RutasModulo = {
  rutasBeneficiario: [{ path: 'postulaciones/:id/documentos', element: <DocumentosPostulacionPage /> }],
};
