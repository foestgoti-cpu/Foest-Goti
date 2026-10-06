import type { RequestHandler } from 'express';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { postulacionService } from './postulacion.service';
import type {
  CrearPostulacionInput,
  DesistirPostulacionInput,
  EnviarPostulacionInput,
  GuardarPostulacionInput,
  ListadoAdminQuery,
  ListadoPropioQuery,
} from './postulaciones.dto';

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
function idempotencyKey(req: { headers: Record<string, unknown> }): string | undefined {
  const h = req.headers['idempotency-key'];
  if (typeof h === 'string' && h.trim()) return h.trim().slice(0, 128);
  return undefined;
}

export const postulacionesController = {
  convocatoriasAbiertas: (async (req, res, next) => {
    try {
      res.json({ data: await postulacionService.convocatoriasAbiertas(usuarioActual(req)) });
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  crear: (async (req, res, next) => {
    try {
      const dto = await postulacionService.crear(usuarioActual(req), contextoDesdeRequest(req), req.body as CrearPostulacionInput);
      res.status(201).json(dto);
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  guardar: (async (req, res, next) => {
    try {
      const dto = await postulacionService.guardar(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as GuardarPostulacionInput);
      res.json(dto);
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  eliminar: (async (req, res, next) => {
    try {
      await postulacionService.eliminarBorrador(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  listarPropias: (async (req, res, next) => {
    try {
      res.json(await postulacionService.listarPropias(usuarioActual(req), req.query as unknown as ListadoPropioQuery));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  listarAdmin: (async (req, res, next) => {
    try {
      res.json(await postulacionService.listarAdmin(usuarioActual(req), contextoDesdeRequest(req), req.query as unknown as ListadoAdminQuery));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  obtener: (async (req, res, next) => {
    try {
      res.json(await postulacionService.obtener(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  validacion: (async (req, res, next) => {
    try {
      res.json(await postulacionService.validacion(usuarioActual(req), req.params.id as string));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  enviar: (async (req, res, next) => {
    try {
      const r = await postulacionService.enviar(
        usuarioActual(req),
        contextoDesdeRequest(req),
        req.params.id as string,
        req.body as EnviarPostulacionInput,
        idempotencyKey(req),
      );
      res.json(r);
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  subsanar: (async (req, res, next) => {
    try {
      const r = await postulacionService.subsanar(
        usuarioActual(req),
        contextoDesdeRequest(req),
        req.params.id as string,
        req.body as EnviarPostulacionInput,
        idempotencyKey(req),
      );
      res.json(r);
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  desistir: (async (req, res, next) => {
    try {
      res.json(await postulacionService.desistir(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as DesistirPostulacionInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  historial: (async (req, res, next) => {
    try {
      res.json({ data: await postulacionService.historial(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string) });
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
