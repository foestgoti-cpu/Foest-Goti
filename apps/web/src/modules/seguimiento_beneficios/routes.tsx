import type { RutasModulo } from '../index';
import { OtorgamientosPage } from './pages/OtorgamientosPage';
import { OtorgamientoDetallePage } from './pages/OtorgamientoDetallePage';
import { CuposPage } from './pages/CuposPage';
import { CargaPagosPage } from './pages/CargaPagosPage';
import { MisBeneficiosPage } from './pages/MisBeneficiosPage';

/** Rutas del modulo seguimiento_beneficios (docs/modules/seguimiento_beneficios.md). */
export const seguimientoBeneficiosRoutes: RutasModulo = {
  rutasAdmin: [
    { path: 'seguimiento', element: <OtorgamientosPage /> },
    { path: 'seguimiento/cupos', element: <CuposPage /> },
    { path: 'seguimiento/carga-pagos', element: <CargaPagosPage /> },
    { path: 'seguimiento/:id', element: <OtorgamientoDetallePage /> },
  ],
  rutasBeneficiario: [{ path: 'beneficios', element: <MisBeneficiosPage /> }],
};
