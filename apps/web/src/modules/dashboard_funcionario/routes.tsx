import type { RutasModulo } from '../index';
import { FuncionarioDashboardPage } from './pages/FuncionarioDashboardPage';

/**
 * Modulo dashboard_funcionario: el panel es la pagina de inicio de /funcionario y
 * tambien responde en /funcionario/metricas (entrada "Metricas" del menu).
 */
export const dashboardFuncionarioRoutes: RutasModulo = {
  rutasFuncionario: [
    { index: true, element: <FuncionarioDashboardPage /> },
    { path: 'metricas', element: <FuncionarioDashboardPage /> },
  ],
};
