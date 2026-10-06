import { z } from 'zod';
import { PeriodoSchema } from '@foest/shared';
import { CODIGOS_ALERTA, SEVERIDADES_ALERTA } from './admin_dashboard.types';

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
