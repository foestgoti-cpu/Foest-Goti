import { z } from 'zod';
import { MIMES_DOCUMENTO_PERMITIDOS, TipoDocumentoSchema } from './enums';

/**
 * Esquemas Zod del modulo documentos. El tope de tamano NO se fija aqui: lo impone el
 * servidor segun MAX_TAMANO_ARCHIVO_MB (422 TAMANO_EXCEDIDO).
 */

export const UploadUrlSchema = z.object({
  tipo_codigo: TipoDocumentoSchema,
  mime: z.enum(MIMES_DOCUMENTO_PERMITIDOS),
  tamano_bytes: z.number().int().positive(),
  nombre_original: z.string().trim().min(1).max(255).optional(),
  formato_generado_id: z.string().uuid().optional(),
  motivo_reemplazo: z.string().trim().min(10).max(500).optional(),
});

export const ConfirmarDocumentoSchema = z.object({
  version: z.number().int().positive(),
  sha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'Debe ser un SHA-256 en hexadecimal')
    .optional(),
});

export const RequisitosQuerySchema = z.object({
  beneficios: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
  tipo_tramite: z.enum(['PRIMERA_VEZ', 'RENOVACION', 'REINTEGRO']).optional(),
});

export type UploadUrlDto = z.infer<typeof UploadUrlSchema>;
export type ConfirmarDocumentoDto = z.infer<typeof ConfirmarDocumentoSchema>;
export type RequisitosQueryDto = z.infer<typeof RequisitosQuerySchema>;
