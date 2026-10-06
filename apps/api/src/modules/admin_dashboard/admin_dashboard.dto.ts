import { z } from 'zod';
import { FechaLocalSchema, PaginacionQuerySchema, PeriodoSchema, UuidSchema, VersionSchema } from '@foest/shared';
import { ACCIONES_AUDITORIA, CODIGOS_ALERTA, ENTIDADES_AUDITORIA, SEVERIDADES_ALERTA } from './admin_dashboard.types';

// --- Dashboard ---------------------------------------------------------------
export const AlertasQueryDto = z.object({
  codigo: z.enum(CODIGOS_ALERTA).optional(),
  severidad: z.enum(SEVERIDADES_ALERTA).optional(),
});
export type AlertasQuery = z.infer<typeof AlertasQueryDto>;

/** `?a=2026-1&b=2025-2` (tambien acepta periodo_a / periodo_b). */
export const MetricasPeriodoQueryDto = z
  .object({
    a: PeriodoSchema.optional(),
    b: PeriodoSchema.optional(),
    periodo_a: PeriodoSchema.optional(),
    periodo_b: PeriodoSchema.optional(),
  })
  .transform((q) => ({ a: q.a ?? q.periodo_a, b: q.b ?? q.periodo_b }))
  .refine((q) => q.a && q.b, { message: 'Se requieren los parametros a y b con formato AAAA-S' })
  .transform((q): MetricasPeriodoQuery => ({ a: q.a as string, b: q.b as string }));
export interface MetricasPeriodoQuery {
  a: string;
  b: string;
}

export const CargaEvaluadoresQueryDto = z.object({
  periodo: PeriodoSchema.optional(),
});
export type CargaEvaluadoresQuery = z.infer<typeof CargaEvaluadoresQueryDto>;

// --- Auditoria ---------------------------------------------------------------
export const AuditoriaListarQueryDto = PaginacionQuerySchema.extend({
  actor_id: UuidSchema.optional(),
  entidad: z.enum(ENTIDADES_AUDITORIA).optional(),
  entidad_id: z.string().trim().min(1).max(200).optional(),
  accion: z.enum(ACCIONES_AUDITORIA).optional(),
  resultado: z.enum(['EXITO', 'FALLO', 'DENEGADO']).optional(),
  request_id: z.string().trim().min(1).max(200).optional(),
  desde: FechaLocalSchema.optional(),
  hasta: FechaLocalSchema.optional(),
});
export type AuditoriaListarQuery = z.infer<typeof AuditoriaListarQueryDto>;

export const AuditoriaEntidadParamsDto = z.object({
  entidad: z.enum(ENTIDADES_AUDITORIA),
  id: z.string().trim().min(1).max(200),
});

// --- Configuracion -----------------------------------------------------------
export const ConfiguracionListarQueryDto = z.object({
  categoria: z
    .enum(['ACUERDO', 'DOCUMENTOS', 'PLAZOS', 'ALERTAS', 'SEGURIDAD', 'PRIVACIDAD', 'JURIDICO', 'LABOR_SOCIAL', 'NOTIFICACIONES'])
    .optional(),
});
export type ConfiguracionListarQuery = z.infer<typeof ConfiguracionListarQueryDto>;

export const ClaveParamDto = z.object({ clave: z.string().trim().regex(/^[A-Z0-9_]{3,80}$/, 'Clave invalida') });

export const ConfiguracionActualizarDto = z
  .object({
    valor: z.union([z.string().max(10_000), z.number(), z.boolean(), z.null()]),
    version: VersionSchema,
    motivo: z.string().trim().max(2000).optional(),
    confirmar: z.boolean().optional(),
  })
  .strict();
export type ConfiguracionActualizar = z.infer<typeof ConfiguracionActualizarDto>;

// --- Festivos ----------------------------------------------------------------
export const FestivosQueryDto = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type FestivosQuery = z.infer<typeof FestivosQueryDto>;

export const FestivoCrearDto = z
  .object({
    fecha: FechaLocalSchema,
    nombre: z.string().trim().min(3).max(120),
  })
  .strict();
export type FestivoCrear = z.infer<typeof FestivoCrearDto>;
