import { Router } from 'express';
import { authenticate, requirePermission, validate } from '../../shared';
import { notificacionesController } from './notificaciones.controller';
import {
  EntregasQueryDto,
  LevantarSupresionDto,
  NotificacionIdParamDto,
  NotificacionesQueryDto,
  OutboxIdParamDto,
  OutboxQueryDto,
  PreferenciasNotificacionDto,
  WebhookCorreoDto,
} from './notificaciones.dto';
import { iniciarJobsNotificaciones } from './notificaciones.jobs';

/**
 * `/api/v1/notificaciones/*` (notificaciones.md).
 *  - Buzon y preferencias: los tres roles (`notificacion:consultar` / `notificacion:marcar_leida`).
 *  - `/admin/*`: `notificacion:administrar` (solo ADMINISTRADOR en la matriz).
 *  - `/webhooks/correo`: unica ruta sin `authenticate()`; firma HMAC (DECISIONES seccion 7, excepcion documentada).
 * Las rutas fijas se declaran ANTES de `/:id/leida` para que no las capture el parametro.
 */
export const notificacionesRoutes: Router = Router();

/* ------------------------------ Buzon propio ------------------------------ */

notificacionesRoutes.get('/me', authenticate(), requirePermission('notificacion:consultar'), validate({ query: NotificacionesQueryDto }), notificacionesController.listar);

notificacionesRoutes.get('/me/no-leidas/contador', authenticate(), requirePermission('notificacion:consultar'), notificacionesController.contador);

notificacionesRoutes.get('/me/preferencias', authenticate(), requirePermission('notificacion:consultar'), notificacionesController.preferencias);

notificacionesRoutes.put(
  '/me/preferencias',
  authenticate(),
  requirePermission('notificacion:marcar_leida'),
  validate({ body: PreferenciasNotificacionDto }),
  notificacionesController.actualizarPreferencias,
);

notificacionesRoutes.patch('/leer-todas', authenticate(), requirePermission('notificacion:marcar_leida'), notificacionesController.leerTodas);

/* ------------------------------ Administracion ---------------------------- */

notificacionesRoutes.get('/admin/outbox', authenticate(), requirePermission('notificacion:administrar'), validate({ query: OutboxQueryDto }), notificacionesController.adminOutbox);

notificacionesRoutes.get(
  '/admin/outbox/:id',
  authenticate(),
  requirePermission('notificacion:administrar'),
  validate({ params: OutboxIdParamDto }),
  notificacionesController.adminOutboxDetalle,
);

notificacionesRoutes.post(
  '/admin/outbox/:id/reintentar',
  authenticate(),
  requirePermission('notificacion:administrar'),
  validate({ params: OutboxIdParamDto }),
  notificacionesController.adminReintentar,
);

notificacionesRoutes.get('/admin/entregas', authenticate(), requirePermission('notificacion:administrar'), validate({ query: EntregasQueryDto }), notificacionesController.adminEntregas);

notificacionesRoutes.get('/admin/entregabilidad', authenticate(), requirePermission('notificacion:administrar'), notificacionesController.adminEntregabilidad);

notificacionesRoutes.post(
  '/admin/suprimidos/levantar',
  authenticate(),
  requirePermission('notificacion:administrar'),
  validate({ body: LevantarSupresionDto }),
  notificacionesController.adminLevantarSupresion,
);

/* --------------------------------- Webhook -------------------------------- */

// La firma se verifica en el controlador ANTES de validar el cuerpo (una peticion sin firma valida no revela el esquema).
notificacionesRoutes.post('/webhooks/correo', notificacionesController.webhookVerificarFirma, validate({ body: WebhookCorreoDto }), notificacionesController.webhookCorreo);

/* ------------------------------- Por id ----------------------------------- */

notificacionesRoutes.patch(
  '/:id/leida',
  authenticate(),
  requirePermission('notificacion:marcar_leida'),
  validate({ params: NotificacionIdParamDto }),
  notificacionesController.marcarLeida,
);

// Los jobs se registran al cargar el modulo (sin tocar server.ts). No arrancan en pruebas ni sin credenciales.
iniciarJobsNotificaciones();
