import { z } from 'zod';
import { EstadoFormatoSchema, EstadoVigenciaFormato, TipoFormatoSchema } from './enums';

const FechaIso = z.string().min(10);

export const FormatoGeneradoSchema = z.object({
  id: z.string().uuid(),
  tipo: TipoFormatoSchema,
  postulacion_id: z.string().uuid(),
  generado_por: z.string().uuid(),
  estado: EstadoFormatoSchema,
  version_plantilla: z.string(),
  hash_contenido: z.string(),
  codigo_verificacion: z.string(),
  tamano_bytes: z.number().nullable(),
  vigente: z.boolean(),
  generado_en: FechaIso,
});

/** Formato con su situacion frente a los datos actuales (listado de la postulacion). */
export const FormatoConVigenciaSchema = FormatoGeneradoSchema.extend({
  desactualizado: z.boolean(),
});

/** Resumen por tipo para la tarjeta de descarga. */
export const ResumenFormatoSchema = z.object({
  tipo: TipoFormatoSchema,
  situacion: z.enum([EstadoVigenciaFormato.NO_GENERADO, EstadoVigenciaFormato.VIGENTE, EstadoVigenciaFormato.DESACTUALIZADO]),
  formato: FormatoGeneradoSchema.nullable(),
});

export const ListadoFormatosSchema = z.object({
  puede_generar: z.boolean(),
  motivo_bloqueo: z.string().nullable(),
  formatos: z.array(ResumenFormatoSchema),
});

export const DescargaFormatoSchema = z.object({
  url: z.string().url(),
  expira_en: FechaIso,
});

export const VerificarFormatoSchema = z.object({
  valido: z.boolean(),
  // GE-F038 (labor_social) tambien se verifica por este mismo endpoint publico.
  tipo: z.union([TipoFormatoSchema, z.literal('GE-F038')]).optional(),
  generado_en: FechaIso.optional(),
  sha256: z.string().optional(),
});

export const GenerarFormatoParamsSchema = z.object({
  id: z.string().uuid(),
  tipo: TipoFormatoSchema,
});

export const CodigoVerificacionParamsSchema = z.object({
  codigo: z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'Codigo de verificacion invalido'),
});

export type FormatoGeneradoDto = z.infer<typeof FormatoGeneradoSchema>;
export type FormatoConVigenciaDto = z.infer<typeof FormatoConVigenciaSchema>;
export type ResumenFormatoDto = z.infer<typeof ResumenFormatoSchema>;
export type ListadoFormatosDto = z.infer<typeof ListadoFormatosSchema>;
export type DescargaFormatoDto = z.infer<typeof DescargaFormatoSchema>;
export type VerificarFormatoDto = z.infer<typeof VerificarFormatoSchema>;
