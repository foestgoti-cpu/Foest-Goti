import { z } from 'zod';

/**
 * Contratos transversales de la API (DECISIONES.md section 1 y section 2).
 */

/** Error estandar: `{ code, message, details? }`. */
export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Codigos HTTP de acceso segun la regla unica de DECISIONES section 2. */
export const HTTP = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  NO_AUTENTICADO: 401,
  SIN_PERMISO: 403,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
  DATOS_INVALIDOS: 422,
  DEMASIADAS_PETICIONES: 429,
  ERROR_INTERNO: 500,
} as const;

/** Codigos de error transversales (los modulos agregan los suyos). */
export const CODIGOS_ERROR_BASE = [
  'NO_AUTENTICADO',
  'TOKEN_INVALIDO',
  'CUENTA_INACTIVA',
  'SIN_PERMISO',
  'NO_ENCONTRADO',
  'CONFLICTO',
  'VERSION_DESACTUALIZADA',
  'DATOS_INVALIDOS',
  'CONFIRMACION_REQUERIDA',
  'DEMASIADAS_PETICIONES',
  'SIN_CREDENCIALES_SUPABASE',
  'ERROR_INTERNO',
] as const;
export type CodigoErrorBase = (typeof CODIGOS_ERROR_BASE)[number];

/** Paginacion estandar: `?page=1&page_size=20` -> `{ data, page, page_size, total }`. */
export const PAGE_SIZE_DEFECTO = 20;
export const PAGE_SIZE_MAXIMO = 100;

export const PaginacionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(PAGE_SIZE_MAXIMO).default(PAGE_SIZE_DEFECTO),
});
export type PaginacionQuery = z.infer<typeof PaginacionQuerySchema>;

export interface Paginado<T> {
  data: T[];
  page: number;
  page_size: number;
  total: number;
}

export const paginadoSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    page: z.number().int().min(1),
    page_size: z.number().int().min(1),
    total: z.number().int().min(0),
  });

/** Respuesta de `GET /api/v1/health`. */
export const HealthSchema = z.object({
  ok: z.boolean(),
  supabase: z.enum(['ok', 'sin_credenciales', 'error']),
  version: z.string().optional(),
  timestamp: z.string(),
});
export type Health = z.infer<typeof HealthSchema>;
