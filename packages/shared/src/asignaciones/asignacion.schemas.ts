import { z } from 'zod';
import { PaginacionQuerySchema } from '../api';
import { CodigoBeneficioSchema, TipoSolicitudSchema } from '../enums';
import { MotivoSchema, UuidSchema } from '../schemas';
import { VistaBandejaSchema } from './asignacion.enums';

/** `version` de la postulacion (bloqueo optimista, opcional). */
const VersionOpcional = z.number().int().min(0).optional();

/** POST /asignaciones/postulaciones/:id/tomar */
export const TomarInputSchema = z.object({ version: VersionOpcional });
export type TomarInput = z.infer<typeof TomarInputSchema>;

/** POST /asignaciones/postulaciones/:id/liberar */
export const LiberarInputSchema = z.object({
  version: VersionOpcional,
  motivo: z.string().trim().max(2000).optional(),
});
export type LiberarInput = z.infer<typeof LiberarInputSchema>;

/** POST /asignaciones/postulaciones/:id/conflicto-interes (motivo >= 15 caracteres). */
export const ConflictoInteresInputSchema = z.object({
  motivo: MotivoSchema,
  version: VersionOpcional,
});
export type ConflictoInteresInput = z.infer<typeof ConflictoInteresInputSchema>;

/** POST /asignaciones/postulaciones/:id/reasignar (administrador). */
export const ReasignarInputSchema = z.object({
  funcionario_id: UuidSchema,
  motivo: MotivoSchema,
  version: VersionOpcional,
});
export type ReasignarInput = z.infer<typeof ReasignarInputSchema>;

/** POST /asignaciones/reasignar-masivo (administrador). Sin destino devuelve las asignaciones al pool. */
export const ReasignarMasivoInputSchema = z.object({
  funcionario_origen_id: UuidSchema,
  funcionario_destino_id: UuidSchema.optional(),
  motivo: MotivoSchema.optional(),
});
export type ReasignarMasivoInput = z.infer<typeof ReasignarMasivoInputSchema>;

/** GET /asignaciones/bandeja */
export const BandejaQuerySchema = PaginacionQuerySchema.extend({
  vista: VistaBandejaSchema.default('TODAS'),
  convocatoria_id: UuidSchema.optional(),
  tipo_solicitud: TipoSolicitudSchema.optional(),
  beneficio: CodigoBeneficioSchema.optional(),
});
export type BandejaQuery = z.infer<typeof BandejaQuerySchema>;

/** GET /asignaciones/alertas */
export const AlertasQuerySchema = PaginacionQuerySchema;
export type AlertasQuery = z.infer<typeof AlertasQuerySchema>;

/** GET /asignaciones/evaluadores (con `postulacion_id` marca excluidos y fuera de comite). */
export const EvaluadoresQuerySchema = z.object({
  convocatoria_id: UuidSchema.optional(),
  postulacion_id: UuidSchema.optional(),
});
export type EvaluadoresQuery = z.infer<typeof EvaluadoresQuerySchema>;
