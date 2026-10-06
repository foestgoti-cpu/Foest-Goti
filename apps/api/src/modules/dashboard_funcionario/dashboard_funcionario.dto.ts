import { z } from 'zod';
import { FechaLocalSchema, UuidSchema } from '@foest/shared';

function fechaValida(v: string): boolean {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Filtros comunes del panel: convocatoria del comite y rango de fechas locales
 * (America/Bogota) con ambos extremos inclusivos.
 */
export const FiltrosDashboardDto = z
  .object({
    convocatoria_id: UuidSchema.optional(),
    desde: FechaLocalSchema.refine(fechaValida, 'Fecha no valida').optional(),
    hasta: FechaLocalSchema.refine(fechaValida, 'Fecha no valida').optional(),
  })
  .strict()
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, {
    message: 'La fecha inicial no puede ser posterior a la fecha final',
    path: ['desde'],
  });

export type FiltrosDashboard = z.infer<typeof FiltrosDashboardDto>;
