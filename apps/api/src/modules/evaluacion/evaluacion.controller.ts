import type { RequestHandler } from 'express';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { evaluacionService } from './evaluacion.service';
import type { ChequeoInput, DictamenInput } from './evaluacion.dto';

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
export const evaluacionController = {
  expediente: (async (req, res, next) => {
    try {
      const dto = await evaluacionService.obtenerExpediente(
        usuarioActual(req),
        contextoDesdeRequest(req),
        req.params.id as string,
        req.alcanceExpediente?.alcance,
      );
      res.json(dto);
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  guardarChequeo: (async (req, res, next) => {
    try {
      res.json(await evaluacionService.guardarChequeo(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as ChequeoInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  dictaminar: (async (req, res, next) => {
    try {
      res.json(await evaluacionService.dictaminar(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as DictamenInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  historial: (async (req, res, next) => {
    try {
      res.json(await evaluacionService.historial(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
