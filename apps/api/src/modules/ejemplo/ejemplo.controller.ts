import type { RequestHandler } from 'express';
import { usuarioActual } from '../../shared';
import { ejemploService } from './ejemplo.service';
import type { EjemploQuery } from './ejemplo.dto';

/**
 * Controlador: traduce HTTP <-> servicio. No contiene reglas de negocio.
 * Los errores se propagan con `next(e)` al manejador global.
 */
export const ejemploController = {
  publico: ((_req, res) => {
    res.json({ mensaje: 'Ruta publica de ejemplo', timestamp: new Date().toISOString() });
  }) as RequestHandler,

  listar: (async (req, res, next) => {
    try {
      const user = usuarioActual(req);
      const query = req.query as unknown as EjemploQuery;
      const resultado = await ejemploService.listar(user, query);
      res.json(resultado);
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
