import type { RequestHandler } from 'express';
import { AppError, contextoDesdeRequest, usuarioActual } from '../../shared';
import type { EntregasQuery, LevantarSupresionInput, NotificacionesQuery, OutboxQuery, PreferenciasNotificacionInput, WebhookCorreoInput } from './notificaciones.dto';
import { envNotificaciones } from './notificaciones.env';
import { notificacionesService } from './notificaciones.service';
import { outboxService } from './outbox.service';
import { entregabilidadService, verificarFirmaWebhook } from './entregabilidad.service';

/** Traduce HTTP <-> servicios; sin reglas de negocio. */
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

  preferencias: (async (req, res, next) => {
    try {
      res.json(await notificacionesService.preferencias(usuarioActual(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  actualizarPreferencias: (async (req, res, next) => {
    try {
      res.json(await notificacionesService.actualizarPreferencias(usuarioActual(req), req.body as PreferenciasNotificacionInput, contextoDesdeRequest(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  /* --------------------------- Administracion --------------------------- */

  adminOutbox: (async (req, res, next) => {
    try {
      res.json(await outboxService.listar(req.query as unknown as OutboxQuery));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  adminOutboxDetalle: (async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      res.json(await outboxService.obtener(id));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  adminReintentar: (async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      res.json(await outboxService.reintentar(id, contextoDesdeRequest(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  adminEntregas: (async (req, res, next) => {
    try {
      res.json(await entregabilidadService.listarEntregas(req.query as unknown as EntregasQuery));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  adminEntregabilidad: (async (_req, res, next) => {
    try {
      res.json(await entregabilidadService.resumen());
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  adminLevantarSupresion: (async (req, res, next) => {
    try {
      const user = usuarioActual(req);
      res.json(await entregabilidadService.levantarSupresion(req.body as LevantarSupresionInput, user.id, contextoDesdeRequest(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  /* ------------------------------ Webhook ------------------------------- */

  /** Sin JWT: autenticado por firma HMAC (cabecera X-Foest-Firma). Deshabilitado (404) sin MAIL_WEBHOOK_SECRET. */
  webhookVerificarFirma: ((req, _res, next) => {
    if (!envNotificaciones().MAIL_WEBHOOK_SECRET) return next(AppError.noEncontrado());
    const firma = req.get('x-foest-firma');
    if (!verificarFirmaWebhook(firma, req.body)) return next(AppError.noAutenticado('FIRMA_INVALIDA', 'Firma del webhook invalida o expirada'));
    return next();
  }) as RequestHandler,

  webhookCorreo: (async (req, res, next) => {
    try {
      res.json(await entregabilidadService.procesarWebhook(req.body as WebhookCorreoInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
