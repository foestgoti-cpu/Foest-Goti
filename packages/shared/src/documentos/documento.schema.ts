import { z } from 'zod';
import { TipoDocumento } from './enums';

export const UploadUrlSchema = z.object({
  tipo_codigo: z.nativeEnum(TipoDocumento),
  mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  tamano_bytes: z.number().positive().max(10 * 1024 * 1024), // 10MB default, will be checked against CONFIG
  formato_generado_id: z.string().uuid().optional(),
  motivo_reemplazo: z.string().optional()
});

export const ConfirmarDocumentoSchema = z.object({
  version: z.number().int().positive(),
  sha256: z.string().length(64).optional()
});

export type UploadUrlDto = z.infer<typeof UploadUrlSchema>;
export type ConfirmarDocumentoDto = z.infer<typeof ConfirmarDocumentoSchema>;

