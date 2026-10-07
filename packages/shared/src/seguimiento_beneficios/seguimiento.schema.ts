import { z } from 'zod';
import { CodigoBeneficioSchema } from '../enums';
import { PaginacionQuerySchema } from '../api';
import { ConfirmarSchema, FechaLocalSchema, MotivoSchema, UuidSchema } from '../schemas';
import { EstadoOtorgamientoSchema } from './seguimiento.enums';

/** Cuerpo comun de suspender / revocar / reactivar: motivo (>= 15 caracteres) y confirmacion de doble intencion. */
export const CambioEstadoOtorgamientoSchema = z
  .object({
    motivo: MotivoSchema,
    confirmar: ConfirmarSchema,
    version: z.number().int().min(0).optional(),
  })
  .strict();
export type CambioEstadoOtorgamientoInput = z.infer<typeof CambioEstadoOtorgamientoSchema>;

export const SuspenderOtorgamientoSchema = CambioEstadoOtorgamientoSchema;
export const RevocarOtorgamientoSchema = CambioEstadoOtorgamientoSchema;
export const ReactivarOtorgamientoSchema = CambioEstadoOtorgamientoSchema;
/** Cumplir: con desembolsos PROGRAMADO pendientes exige `forzar: true` (los anula). */
export const CumplirOtorgamientoSchema = CambioEstadoOtorgamientoSchema.extend({ forzar: z.boolean().optional() }).strict();
export type CumplirOtorgamientoInput = z.infer<typeof CumplirOtorgamientoSchema>;

const MontoSchema = z
  .number()
  .positive('El monto debe ser mayor que cero')
  .max(1_000_000_000_000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'El monto admite maximo dos decimales');

export const ProgramarDesembolsoSchema = z
  .object({
    monto: MontoSchema,
    fecha_programada: FechaLocalSchema,
    concepto: z.string().trim().min(1).max(200).optional(),
    /** Obligatorio (true) si el otorgamiento excede cupo o presupuesto y es el primer desembolso. */
    confirmar_excedente: z.boolean().optional(),
    motivo_excedente: MotivoSchema.optional(),
  })
  .strict();
export type ProgramarDesembolsoInput = z.infer<typeof ProgramarDesembolsoSchema>;

export const PagarDesembolsoSchema = z
  .object({
    referencia_pago: z.string().trim().min(3, 'La referencia debe tener al menos 3 caracteres').max(100),
    fecha_pago: FechaLocalSchema,
  })
  .strict();
export type PagarDesembolsoInput = z.infer<typeof PagarDesembolsoSchema>;

export const AnularDesembolsoSchema = z.object({ motivo: MotivoSchema }).strict();
export type AnularDesembolsoInput = z.infer<typeof AnularDesembolsoSchema>;

/**
 * Carga masiva de pagos. `dry_run` (por defecto true) solo valida y reporta por fila; para aplicar
 * se envia `dry_run: false` y `confirmar: true` (todo o nada).
 */
export const CargaMasivaPagosSchema = z
  .object({
    contenido_csv: z.string().min(1, 'El archivo CSV esta vacio').max(900_000, 'El archivo CSV excede el tamano maximo'),
    nombre_archivo: z.string().trim().max(200).optional(),
    dry_run: z.boolean().default(true),
    confirmar: z.boolean().optional(),
  })
  .strict();
export type CargaMasivaPagosInput = z.infer<typeof CargaMasivaPagosSchema>;

export const FiltrosOtorgamientosSchema = PaginacionQuerySchema.extend({
  convocatoria_id: UuidSchema.optional(),
  beneficio: CodigoBeneficioSchema.optional(),
  estado: EstadoOtorgamientoSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
export type FiltrosOtorgamientosInput = z.infer<typeof FiltrosOtorgamientosSchema>;

export const CuposQuerySchema = z.object({ convocatoria_id: UuidSchema.optional() });
export type CuposQueryInput = z.infer<typeof CuposQuerySchema>;
