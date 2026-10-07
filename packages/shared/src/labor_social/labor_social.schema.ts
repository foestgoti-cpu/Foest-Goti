import { z } from 'zod';
import { ConfirmarSchema, FechaLocalSchema, UuidSchema } from '../schemas';
import {
  LABOR_SOCIAL_DESCRIPCION_MAX,
  LABOR_SOCIAL_DESCRIPCION_MIN,
  LABOR_SOCIAL_HORAS_ACTIVIDAD_TECHO,
} from './labor_social.enums';

/**
 * Esquemas de ENTRADA de `labor_social` (los usan la API y el formulario web).
 * El tope diario configurable (LABOR_SOCIAL_HORAS_MAX_DIA, suma por fecha) y la fecha no futura
 * (zona America/Bogota) los aplica el servicio / trigger y responden 422.
 */

const texto = (campo: string, max = 200) =>
  z.string().trim().min(1, `${campo} es obligatorio`).max(max, `${campo} admite hasta ${max} caracteres`);

/** Semestre academico `AAAA-S` (p. ej. 2026-1). */
export const SemestreAcademicoSchema = z.string().trim().regex(/^\d{4}-[12]$/, 'Formato esperado AAAA-1 o AAAA-2');

export const CrearCertificadoSchema = z
  .object({
    semestre_academico: SemestreAcademicoSchema,
    postulacion_id: UuidSchema.optional(),
  })
  .strict();
export type CrearCertificadoInput = z.infer<typeof CrearCertificadoSchema>;

/** Horas con hasta dos decimales, mayores que 0 y no mayores que el techo absoluto. */
export const HorasActividadSchema = z
  .number({ invalid_type_error: 'Las horas deben ser un numero' })
  .positive('Las horas deben ser mayores que 0')
  .max(LABOR_SOCIAL_HORAS_ACTIVIDAD_TECHO, `Las horas no pueden superar ${LABOR_SOCIAL_HORAS_ACTIVIDAD_TECHO}`)
  .refine((h) => Math.abs(Math.round(h * 100) / 100 - h) < 1e-9, 'Use hasta dos decimales');

export const ActividadInputSchema = z
  .object({
    fecha_actividad: FechaLocalSchema,
    horas_ejecutadas: HorasActividadSchema,
    descripcion_actividad: z
      .string()
      .trim()
      .min(LABOR_SOCIAL_DESCRIPCION_MIN, `La descripcion requiere al menos ${LABOR_SOCIAL_DESCRIPCION_MIN} caracteres`)
      .max(LABOR_SOCIAL_DESCRIPCION_MAX, `La descripcion admite hasta ${LABOR_SOCIAL_DESCRIPCION_MAX} caracteres`),
    dependencia_municipal: texto('La dependencia'),
    nombre_supervisor: texto('El nombre del supervisor'),
    cargo_supervisor: texto('El cargo del supervisor'),
  })
  .strict();
export type ActividadInput = z.infer<typeof ActividadInputSchema>;

export const ActividadPatchSchema = ActividadInputSchema.partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo a modificar');
export type ActividadPatchInput = z.infer<typeof ActividadPatchSchema>;

/** PATCH /labor-social/:id/presentar */
export const PresentarCertificadoSchema = z
  .object({
    documento_id: UuidSchema,
    confirmar: ConfirmarSchema,
  })
  .strict();
export type PresentarCertificadoInput = z.infer<typeof PresentarCertificadoSchema>;

/** PATCH /labor-social/:id/completar */
export const CompletarCertificadoSchema = z.object({ confirmar: ConfirmarSchema }).strict();
export type CompletarCertificadoInput = z.infer<typeof CompletarCertificadoSchema>;

/** PATCH /labor-social/:id/reabrir */
export const ReabrirCertificadoSchema = CompletarCertificadoSchema;
export type ReabrirCertificadoInput = z.infer<typeof ReabrirCertificadoSchema>;

export const CertificadoParamsSchema = z.object({ id: UuidSchema });
export const ActividadParamsSchema = z.object({ id: UuidSchema, actividadId: UuidSchema });
export const BeneficiarioLaborSocialParamsSchema = z.object({ beneficiarioId: UuidSchema });
