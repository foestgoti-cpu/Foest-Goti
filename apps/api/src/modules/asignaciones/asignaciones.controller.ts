import type { RequestHandler } from 'express';
import type {
  BandejaQuery,
  ConflictoInteresInput,
  EvaluadoresQuery,
  LiberarInput,
  PaginacionQuery,
  ReasignarInput,
  ReasignarMasivoInput,
  TomarInput,
} from '@foest/shared';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { asignacionesService } from './asignaciones.service';

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
export const asignacionesController = {
  bandeja: (async (req, res, next) => {
    try {
      res.json(await asignacionesService.bandeja(usuarioActual(req), req.query as unknown as BandejaQuery));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  tomar: (async (req, res, next) => {
    try {
      res.json(await asignacionesService.tomar(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as TomarInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  liberar: (async (req, res, next) => {
    try {
      res.json(await asignacionesService.liberar(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as LiberarInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  conflictoInteres: (async (req, res, next) => {
    try {
      res.json(await asignacionesService.declararConflicto(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as ConflictoInteresInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  reasignar: (async (req, res, next) => {
    try {
      res.json(await asignacionesService.reasignar(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as ReasignarInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  reasignarMasivo: (async (req, res, next) => {
    try {
      res.json(await asignacionesService.reasignarMasivo(usuarioActual(req), contextoDesdeRequest(req), req.body as ReasignarMasivoInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  historial: (async (req, res, next) => {
    try {
      res.json({ data: await asignacionesService.historial(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string) });
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  alertas: (async (req, res, next) => {
    try {
      res.json(await asignacionesService.alertas(usuarioActual(req), contextoDesdeRequest(req), req.query as unknown as PaginacionQuery));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  evaluadores: (async (req, res, next) => {
    try {
      res.json({ data: await asignacionesService.evaluadores(req.query as unknown as EvaluadoresQuery) });
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
