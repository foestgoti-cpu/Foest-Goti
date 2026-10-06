import { z } from 'zod';
import { PaginacionQuerySchema } from '../api';
import { FechaLocalSchema, MotivoSchema, UuidSchema } from '../schemas';
import {
  AccionAuditoriaSchema,
  EntidadAuditoriaSchema,
  FormatoExportacionAuditoriaSchema,
  ResultadoAuditoriaSchema,
} from './auditoria.enums';

/**
 * Esquemas Zod del modulo auditoria compartidos por API y web.
 * Las fechas `desde`/`hasta` son dias locales (America/Bogota) con cierre inclusivo.
 */
export const AuditoriaFiltrosSchema = z.object({
  actor_id: UuidSchema.optional(),
  entidad: EntidadAuditoriaSchema.optional(),
  entidad_id: z.string().trim().min(1).max(200).optional(),
  accion: AccionAuditoriaSchema.optional(),
  resultado: ResultadoAuditoriaSchema.optional(),
  request_id: z.string().trim().min(1).max(200).optional(),
  desde: FechaLocalSchema.optional(),
  hasta: FechaLocalSchema.optional(),
});
export type AuditoriaFiltros = z.infer<typeof AuditoriaFiltrosSchema>;

/** `GET /auditoria` (contrato vigente: filtros + paginacion estandar). */
export const AuditoriaListarQuerySchema = PaginacionQuerySchema.merge(AuditoriaFiltrosSchema);
export type AuditoriaListarQuery = z.infer<typeof AuditoriaListarQuerySchema>;

/** `GET /auditoria/entidad/:entidad/:id`. */
export const AuditoriaEntidadParamsSchema = z.object({
  entidad: EntidadAuditoriaSchema,
  id: z.string().trim().min(1).max(200),
});
export type AuditoriaEntidadParams = z.infer<typeof AuditoriaEntidadParamsSchema>;

/** `GET /auditoria/exportar`: mismos filtros, motivo obligatorio y formato. */
export const AuditoriaExportarQuerySchema = AuditoriaFiltrosSchema.extend({
  motivo: MotivoSchema,
  formato: FormatoExportacionAuditoriaSchema.default('CSV'),
});
export type AuditoriaExportarQuery = z.infer<typeof AuditoriaExportarQuerySchema>;
