import { Navigate, useLocation } from 'react-router-dom';
import type { RutasModulo } from '../index';
import { EvaluacionAdminPage, EvaluacionExpedientePage } from './pages/EvaluacionExpedientePage';

/** `/funcionario/evaluacion` (sin id) redirige a la bandeja conservando los filtros de la query. */
function RedirigirABandeja() {
  const { search } = useLocation();
  return <Navigate to={`/funcionario/bandeja${search}`} replace />;
}

/** Rutas del modulo evaluacion (docs/modules/evaluacion.md). */
export const evaluacionRoutes: RutasModulo = {
  rutasFuncionario: [
    { path: 'evaluacion', element: <RedirigirABandeja /> },
    { path: 'evaluacion/:id', element: <EvaluacionExpedientePage /> },
  ],
  rutasAdmin: [{ path: 'postulaciones/:id/evaluacion', element: <EvaluacionAdminPage /> }],
};
