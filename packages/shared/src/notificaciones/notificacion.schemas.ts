import { z } from 'zod';
import { PaginacionQuerySchema } from '../api';
import { EmailSchema, IdParamSchema } from '../schemas';
import { ESTADOS_ENTREGA_CORREO, ESTADOS_OUTBOX, SEVERIDADES_NOTIFICACION, TIPOS_NOTIFICACION } from './notificacion.enums';

/** Listado de notificaciones propias: paginacion estandar + filtros opcionales (contrato vigente). */
export const NotificacionesQuerySchema = PaginacionQuerySchema.extend({
  leida: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
  tipo: z.string().trim().min(1).max(80).optional(),
  severidad: z.enum(SEVERIDADES_NOTIFICACION).optional(),
});
export type NotificacionesQuery = z.infer<typeof NotificacionesQuerySchema>;

export const NotificacionIdParamSchema = IdParamSchema;

/** Preferencias minimas (PUT /notificaciones/me/preferencias). */
export const PreferenciasNotificacionSchema = z
  .object({
    correo_recordatorios: z.boolean(),
    correo_informativos: z.boolean(),
  })
  .strict();
export type PreferenciasNotificacionInput = z.infer<typeof PreferenciasNotificacionSchema>;

/** GET /notificaciones/admin/outbox */
export const OutboxQuerySchema = PaginacionQuerySchema.extend({
  estado: z.enum(ESTADOS_OUTBOX).optional(),
  tipo: z.enum(TIPOS_NOTIFICACION).optional(),
});
export type OutboxQuery = z.infer<typeof OutboxQuerySchema>;

export const OutboxIdParamSchema = IdParamSchema;

/** GET /notificaciones/admin/entregas */
export const EntregasQuerySchema = PaginacionQuerySchema.extend({
  estado: z.enum(ESTADOS_ENTREGA_CORREO).optional(),
  email: z.string().trim().min(3).max(254).optional(),
});
export type EntregasQuery = z.infer<typeof EntregasQuerySchema>;

/** POST /notificaciones/admin/suprimidos/levantar (el email va en el cuerpo, nunca en la URL). */
export const LevantarSupresionSchema = z
  .object({
    email: EmailSchema,
    motivo: z.string().trim().min(15).max(500),
  })
  .strict();
export type LevantarSupresionInput = z.infer<typeof LevantarSupresionSchema>;

/**
 * POST /notificaciones/webhooks/correo. Contrato neutro del proveedor:
 * un evento por peticion o una lista `eventos`.
 */
export const EventoWebhookCorreoSchema = z.object({
  tipo: z.enum(['ENTREGADO', 'REBOTE', 'QUEJA', 'FALLO']),
  id_mensaje_proveedor: z.string().trim().min(1).max(200).optional(),
  email: EmailSchema.optional(),
  codigo_rebote: z.enum(['HARD', 'SOFT']).optional(),
  detalle: z.string().trim().max(1000).optional(),
  ocurrido_en: z.string().datetime({ offset: true }).optional(),
});
export type EventoWebhookCorreo = z.infer<typeof EventoWebhookCorreoSchema>;

export const WebhookCorreoSchema = z.union([
  z.object({ eventos: z.array(EventoWebhookCorreoSchema).min(1).max(500) }),
  EventoWebhookCorreoSchema,
]);
export type WebhookCorreoInput = z.infer<typeof WebhookCorreoSchema>;
