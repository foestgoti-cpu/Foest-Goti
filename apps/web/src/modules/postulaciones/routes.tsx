import type { RutasModulo } from '../index';
import { PostulacionesListaPage } from './pages/PostulacionesListaPage';
import { NuevaPostulacionPage } from './pages/NuevaPostulacionPage';
import { PostulacionDetallePage } from './pages/PostulacionDetallePage';
import { HistorialPage } from './pages/HistorialPage';
import { AdminPostulacionesPage } from './pages/AdminPostulacionesPage';
import { AdminPostulacionDetallePage } from './pages/AdminPostulacionDetallePage';

/** Rutas del modulo postulaciones (docs/modules/postulaciones.md). */
export const postulacionesRoutes: RutasModulo = {
  rutasBeneficiario: [
    { path: 'postulaciones', element: <PostulacionesListaPage /> },
    { path: 'postulaciones/nueva', element: <NuevaPostulacionPage /> },
    { path: 'postulaciones/:id', element: <PostulacionDetallePage /> },
    { path: 'postulaciones/:id/historial', element: <HistorialPage /> },
  ],
  rutasAdmin: [
    { path: 'postulaciones', element: <AdminPostulacionesPage /> },
    { path: 'postulaciones/:id', element: <AdminPostulacionDetallePage /> },
  ],
};
