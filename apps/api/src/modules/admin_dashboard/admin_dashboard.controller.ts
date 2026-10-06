import type { RequestHandler } from 'express';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { adminDashboardService } from './admin_dashboard.service';
import { auditoriaService } from './auditoria.service';
import { configuracionService } from './configuracion.service';
import { festivosService } from './festivos.service';
import type {
  AlertasQuery,
  AuditoriaListarQuery,
  CargaEvaluadoresQuery,
  ConfiguracionActualizar,
  ConfiguracionListarQuery,
  FestivoCrear,
  FestivosQuery,
  MetricasPeriodoQuery,
} from './admin_dashboard.dto';

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

export const auditoriaController = {
  catalogo: h(async (_req, res) => {
    res.json(auditoriaService.catalogo());
  }),
  listar: h(async (req, res) => {
    res.json(await auditoriaService.listar(usuarioActual(req), req.query as unknown as AuditoriaListarQuery, contextoDesdeRequest(req)));
  }),
  detalle: h(async (req, res) => {
    res.json(await auditoriaService.detalle(usuarioActual(req), req.params.id as string, contextoDesdeRequest(req)));
  }),
  porEntidad: h(async (req, res) => {
    res.json(await auditoriaService.porEntidad(usuarioActual(req), req.params.entidad as string, req.params.id as string, contextoDesdeRequest(req)));
  }),
};

export const configuracionController = {
  listar: h(async (req, res) => {
    res.json(await configuracionService.listar(usuarioActual(req), req.query as unknown as ConfiguracionListarQuery));
  }),
  obtener: h(async (req, res) => {
    res.json(await configuracionService.obtener(usuarioActual(req), req.params.clave as string));
  }),
  actualizar: h(async (req, res) => {
    res.json(
      await configuracionService.actualizar(usuarioActual(req), req.params.clave as string, req.body as ConfiguracionActualizar, contextoDesdeRequest(req)),
    );
  }),
};

export const festivosController = {
  listar: h(async (req, res) => {
    res.json(await festivosService.listar(usuarioActual(req), req.query as unknown as FestivosQuery));
  }),
  crear: h(async (req, res) => {
    res.status(201).json(await festivosService.crear(usuarioActual(req), req.body as FestivoCrear, contextoDesdeRequest(req)));
  }),
  eliminar: h(async (req, res) => {
    await festivosService.eliminar(usuarioActual(req), req.params.id as string, contextoDesdeRequest(req));
    res.status(204).end();
  }),
};
