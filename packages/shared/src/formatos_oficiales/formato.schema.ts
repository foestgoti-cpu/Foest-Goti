import { z } from 'zod';
import { TipoFormato, EstadoFormato } from './enums';

export const FormatoGeneradoSchema = z.object({
  id: z.string().uuid(),
  tipo: z.nativeEnum(TipoFormato),
  postulacion_id: z.string().uuid(),
  generado_por: z.string().uuid(),
  estado: z.nativeEnum(EstadoFormato),
  version_plantilla: z.string(),
  hash_contenido: z.string(),
  codigo_verificacion: z.string(),
  tamano_bytes: z.number().nullable(),
  vigente: z.boolean(),
  generado_en: z.string().datetime()
});

export const VerificarFormatoSchema = z.object({
  valido: z.boolean(),
  tipo: z.nativeEnum(TipoFormato).optional(),
  generado_en: z.string().datetime().optional(),
  sha256: z.string().optional()
});

export type FormatoGeneradoDto = z.infer<typeof FormatoGeneradoSchema>;
export type VerificarFormatoDto = z.infer<typeof VerificarFormatoSchema>;

