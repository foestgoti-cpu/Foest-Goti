import type { RequestHandler } from 'express';
import { usuarioActual } from '../../shared';
import { adminDashboardService } from './admin_dashboard.service';
import type { AlertasQuery, CargaEvaluadoresQuery, MetricasPeriodoQuery } from './admin_dashboard.dto';

/** Envuelve un handler async y propaga errores al manejador global. */
const h =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const adminDashboardController = {
  resumen: h(async (req, res) => {
    res.json(await adminDashboardService.resumen(usuarioActual(req)));
  }),
  alertas: h(async (req, res) => {
    res.json(await adminDashboardService.alertas(usuarioActual(req), req.query as unknown as AlertasQuery));
  }),
  convocatorias: h(async (req, res) => {
    res.json(await adminDashboardService.convocatorias(usuarioActual(req)));
  }),
  metricasPeriodo: h(async (req, res) => {
    res.json(await adminDashboardService.metricasPeriodo(usuarioActual(req), req.query as unknown as MetricasPeriodoQuery));
  }),
  cargaEvaluadores: h(async (req, res) => {
    res.json(await adminDashboardService.cargaEvaluadores(usuarioActual(req), req.query as unknown as CargaEvaluadoresQuery));
  }),
};
