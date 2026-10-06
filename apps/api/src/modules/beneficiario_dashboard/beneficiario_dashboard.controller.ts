import type { RequestHandler } from 'express';
import { usuarioActual } from '../../shared';
import { beneficiarioDashboardService } from './beneficiario_dashboard.service';
import type { PostulacionIdParam } from './beneficiario_dashboard.dto';

/** Controlador: traduce HTTP <-> servicio; sin reglas de negocio. */
export const beneficiarioDashboardController = {
  resumen: (async (req, res, next) => {
    try {
      res.json(await beneficiarioDashboardService.resumen(usuarioActual(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  lineaTiempo: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as PostulacionIdParam;
      res.json(await beneficiarioDashboardService.lineaTiempo(usuarioActual(req), id));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  documentos: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as PostulacionIdParam;
      res.json(await beneficiarioDashboardService.documentos(usuarioActual(req), id));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  descargas: (async (req, res, next) => {
    try {
      res.json(await beneficiarioDashboardService.descargas(usuarioActual(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  otorgamientos: (async (req, res, next) => {
    try {
      res.json(await beneficiarioDashboardService.otorgamientos(usuarioActual(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
