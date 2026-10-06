import { Router } from 'express';
import { authenticate, requirePermission, validate } from '../../shared';
import { dashboardFuncionarioController as c } from './dashboard_funcionario.controller';
import { FiltrosDashboardDto } from './dashboard_funcionario.dto';
import { iniciarJobRefrescoMetricas } from './metricas.refresh.job';

/**
 * Rutas bajo /api/v1/dashboard/funcionario (docs/modules/dashboard_funcionario.md).
 * Todas: authenticate() -> requirePermission('dashboard:funcionario') -> validate(query) -> controller.
 * NO existe /exportar (DECISIONES section 15: la exportacion es exclusiva de export_reports).
 */
export const dashboardFuncionarioRoutes: Router = Router();

const guardia = [authenticate(), requirePermission('dashboard:funcionario')];
const filtros = validate({ query: FiltrosDashboardDto });

dashboardFuncionarioRoutes.get('/resumen', ...guardia, filtros, c.resumen);
dashboardFuncionarioRoutes.get('/por-beneficio', ...guardia, filtros, c.porBeneficio);
dashboardFuncionarioRoutes.get('/por-tipo-solicitud', ...guardia, filtros, c.porTipoSolicitud);
dashboardFuncionarioRoutes.get('/serie-temporal', ...guardia, filtros, c.serieTemporal);
dashboardFuncionarioRoutes.get('/tiempos-revision', ...guardia, filtros, c.tiemposRevision);
dashboardFuncionarioRoutes.get('/carga', ...guardia, filtros, c.carga);
dashboardFuncionarioRoutes.get('/convocatorias', ...guardia, c.convocatorias);

// Job de refresco de las vistas materializadas (cada 5 min). Se inicia al registrar el
// modulo; es inocuo sin credenciales y en pruebas (devuelve null).
iniciarJobRefrescoMetricas();
