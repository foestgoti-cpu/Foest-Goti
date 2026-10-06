import { z } from 'zod';
import { IdParamSchema, PaginacionQuerySchema } from '@foest/shared';

/** `:id` de postulacion (uuid). */
export const PostulacionIdParamDto = IdParamSchema;
export type PostulacionIdParam = z.infer<typeof PostulacionIdParamDto>;

/** Listado de notificaciones propias: paginacion estandar + filtros opcionales. */
export const NotificacionesQueryDto = PaginacionQuerySchema.extend({
  leida: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
  tipo: z.string().trim().min(1).max(80).optional(),
  severidad: z.enum(['INFO', 'ADVERTENCIA', 'CRITICA']).optional(),
});
export type NotificacionesQuery = z.infer<typeof NotificacionesQueryDto>;

export const NotificacionIdParamDto = IdParamSchema;
