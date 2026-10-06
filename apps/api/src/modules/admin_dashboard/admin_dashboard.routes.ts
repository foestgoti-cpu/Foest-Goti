import { Router } from 'express';
import { authenticate, requirePermission, validate } from '../../shared';
import { adminDashboardController } from './admin_dashboard.controller';
import { AlertasQueryDto, CargaEvaluadoresQueryDto, MetricasPeriodoQueryDto } from './admin_dashboard.dto';

/**
 * Modulo admin_dashboard. Expone un router (registrado en src/modules/index.ts):
 *   /dashboard/admin  -> panel gerencial (permiso dashboard:admin, solo ADMINISTRADOR)
 * La bitacora (/auditoria) vive en src/modules/auditoria; configuracion y festivos
 * (/configuracion, /festivos) en src/modules/catalogos_configuracion.
 */
export const adminDashboardRoutes: Router = Router();
adminDashboardRoutes.use(authenticate(), requirePermission('dashboard:admin'));
adminDashboardRoutes.get('/resumen', adminDashboardController.resumen);
adminDashboardRoutes.get('/alertas', validate({ query: AlertasQueryDto }), adminDashboardController.alertas);
adminDashboardRoutes.get('/convocatorias', adminDashboardController.convocatorias);
adminDashboardRoutes.get('/metricas/periodo', validate({ query: MetricasPeriodoQueryDto }), adminDashboardController.metricasPeriodo);
adminDashboardRoutes.get('/carga-evaluadores', validate({ query: CargaEvaluadoresQueryDto }), adminDashboardController.cargaEvaluadores);
