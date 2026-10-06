/**
 * DTOs del modulo: todos los esquemas Zod viven en `@foest/shared` (packages/shared/src/notificaciones)
 * para que la SPA valide con las mismas reglas. Aqui solo se reexportan con el nombre convencional.
 */
export {
  NotificacionesQuerySchema as NotificacionesQueryDto,
  NotificacionIdParamSchema as NotificacionIdParamDto,
  PreferenciasNotificacionSchema as PreferenciasNotificacionDto,
  OutboxQuerySchema as OutboxQueryDto,
  OutboxIdParamSchema as OutboxIdParamDto,
  EntregasQuerySchema as EntregasQueryDto,
  LevantarSupresionSchema as LevantarSupresionDto,
  WebhookCorreoSchema as WebhookCorreoDto,
} from '@foest/shared';

export type {
  NotificacionesQuery,
  PreferenciasNotificacionInput,
  OutboxQuery,
  EntregasQuery,
  LevantarSupresionInput,
  WebhookCorreoInput,
  EventoWebhookCorreo,
} from '@foest/shared';
