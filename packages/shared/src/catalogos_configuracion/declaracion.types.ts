import { z } from 'zod';

/** Declaraciones juramentadas del GE-F041 (DECL_1..DECL_6), versionadas e inmutables. */
export const CODIGOS_DECLARACION = ['DECL_1', 'DECL_2', 'DECL_3', 'DECL_4', 'DECL_5', 'DECL_6'] as const;
export type CodigoDeclaracion = (typeof CODIGOS_DECLARACION)[number];

export interface DeclaracionJuramentada {
  id: string;
  codigo: CodigoDeclaracion;
  version: number;
  titulo: string;
  texto: string;
  vigente: boolean;
  texto_oficial_confirmado: boolean;
  vigente_desde: string;
  creado_por: string | null;
  creado_en: string;
}

export interface TextoConsentimiento {
  id: string;
  version: number;
  texto: string;
  vigente: boolean;
  vigente_desde: string;
  creado_por: string | null;
  creado_en: string;
}

/** Respuesta de GET /catalogos/consentimiento/vigente (compatible con /auth/consentimiento/vigente). */
export interface ConsentimientoVigenteDto {
  version: number;
  texto: string;
  vigente_desde: string | null;
}

export const CodigoDeclaracionParamSchema = z.object({ codigo: z.enum(CODIGOS_DECLARACION) });

export const PublicarDeclaracionSchema = z
  .object({
    titulo: z.string().trim().min(3).max(200),
    texto: z.string().trim().min(20).max(20_000),
    texto_oficial_confirmado: z.boolean().default(true),
    motivo: z.string().trim().max(2000).optional(),
    confirmar: z.literal(true, { errorMap: () => ({ message: 'Se requiere confirmacion explicita (confirmar: true)' }) }),
  })
  .strict();
export type PublicarDeclaracion = z.infer<typeof PublicarDeclaracionSchema>;

export const PublicarConsentimientoSchema = z
  .object({
    texto: z.string().trim().min(50).max(20_000),
    motivo: z.string().trim().max(2000).optional(),
    confirmar: z.literal(true, { errorMap: () => ({ message: 'Se requiere confirmacion explicita (confirmar: true)' }) }),
  })
  .strict();
export type PublicarConsentimiento = z.infer<typeof PublicarConsentimientoSchema>;
