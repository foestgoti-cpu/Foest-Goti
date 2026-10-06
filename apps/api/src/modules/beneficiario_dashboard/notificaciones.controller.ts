import type { RequestHandler } from 'express';
import { usuarioActual } from '../../shared';
import { notificacionesService } from './notificaciones.service';
import type { NotificacionesQuery } from './beneficiario_dashboard.dto';

export const notificacionesController = {
  listar: (async (req, res, next) => {
    try {
      res.json(await notificacionesService.listar(usuarioActual(req), req.query as unknown as NotificacionesQuery));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  contador: (async (req, res, next) => {
    try {
      res.json(await notificacionesService.contadorNoLeidas(usuarioActual(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  marcarLeida: (async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      res.json(await notificacionesService.marcarLeida(usuarioActual(req), id));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  leerTodas: (async (req, res, next) => {
    try {
      res.json(await notificacionesService.leerTodas(usuarioActual(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
