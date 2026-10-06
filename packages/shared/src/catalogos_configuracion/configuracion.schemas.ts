import { z } from 'zod';
import { ConfirmarSchema, FechaLocalSchema, VersionSchema } from '../schemas';
import { CATEGORIAS_CONFIGURACION } from './configuracion.keys';

// --- Configuracion -----------------------------------------------------------
export const ConfiguracionListarQuerySchema = z.object({
  categoria: z.enum(CATEGORIAS_CONFIGURACION).optional(),
});
export type ConfiguracionListarQuery = z.infer<typeof ConfiguracionListarQuerySchema>;

export const ClaveParamSchema = z.object({ clave: z.string().trim().regex(/^[A-Z0-9_]{3,80}$/, 'Clave invalida') });

/** Cuerpo de PUT /configuracion/:clave (contrato compartido con el panel admin). */
export const ConfiguracionActualizarSchema = z
  .object({
    valor: z.union([z.string().max(10_000), z.number(), z.boolean(), z.null()]),
    version: VersionSchema,
    motivo: z.string().trim().max(2000).optional(),
    confirmar: z.boolean().optional(),
  })
  .strict();
export type ConfiguracionActualizar = z.infer<typeof ConfiguracionActualizarSchema>;

// --- Festivos ----------------------------------------------------------------
export const AnioSchema = z.coerce.number().int().min(2000).max(2100);

export const FestivosQuerySchema = z.object({ anio: AnioSchema.optional() });
export type FestivosQuery = z.infer<typeof FestivosQuerySchema>;

export const FestivoCrearSchema = z
  .object({
    fecha: FechaLocalSchema,
    nombre: z.string().trim().min(3).max(120),
  })
  .strict();
export type FestivoCrear = z.infer<typeof FestivoCrearSchema>;

/** POST /festivos/carga-anual: reemplaza SOLO los festivos del anio indicado. */
export const FestivosCargaAnualSchema = z
  .object({
    anio: AnioSchema,
    festivos: z.array(FestivoCrearSchema).min(1).max(40),
    confirmar: ConfirmarSchema,
  })
  .strict()
  .refine((c) => c.festivos.every((f) => Number(f.fecha.slice(0, 4)) === c.anio), {
    message: 'Todas las fechas deben pertenecer al anio indicado',
    path: ['festivos'],
  });
export type FestivosCargaAnual = z.infer<typeof FestivosCargaAnualSchema>;

/** GET /festivos/dias-habiles?desde=YYYY-MM-DD&n=5 */
export const DiasHabilesQuerySchema = z.object({
  desde: FechaLocalSchema,
  n: z.coerce.number().int().min(0).max(365),
});
export type DiasHabilesQuery = z.infer<typeof DiasHabilesQuerySchema>;

export interface DiasHabilesResultado {
  desde: string;
  n: number;
  resultado: string;
  /** Instante exclusivo siguiente (00:00 America/Bogota del dia siguiente) en ISO. */
  fin_del_dia_exclusivo: string;
}

export const FestivosPropuestaQuerySchema = z.object({ anio: AnioSchema });
