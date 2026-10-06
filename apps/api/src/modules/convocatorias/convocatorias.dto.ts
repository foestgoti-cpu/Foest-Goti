import { z } from 'zod';
import {
  CodigoBeneficioSchema,
  ConfirmarSchema,
  EstadoConvocatoriaSchema,
  FechaLocalSchema,
  MotivoSchema,
  PaginacionQuerySchema,
  UuidSchema,
  VersionSchema,
} from '@foest/shared';

/** DTOs del modulo convocatorias (Zod). Reutilizan los esquemas base de @foest/shared. */

export const BeneficioOfertadoDto = z
  .object({
    codigo: CodigoBeneficioSchema,
    cupos_estimados: z.coerce.number().int().min(0).default(0),
    presupuesto_asignado: z.coerce.number().min(0).default(0),
    valor_apoyo_referencial: z.coerce.number().min(0).default(0),
  })
  .strict();
export type BeneficioOfertadoInput = z.infer<typeof BeneficioOfertadoDto>;

const beneficiosSinDuplicados = (lista: BeneficioOfertadoInput[]) =>
  new Set(lista.map((b) => b.codigo)).size === lista.length;

export const CrearConvocatoriaDto = z
  .object({
    anio: z.coerce.number().int().min(2024).max(2100),
    semestre: z.coerce.number().int().min(1).max(2),
    nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(200),
    descripcion: z.string().trim().max(5000).default(''),
    fecha_apertura: FechaLocalSchema,
    /** Ultimo dia habilitado (se presenta como 23:59:59 locales). */
    fecha_cierre: FechaLocalSchema,
    beneficios: z.array(BeneficioOfertadoDto).max(12).default([]).refine(beneficiosSinDuplicados, {
      message: 'No se puede ofertar dos veces el mismo beneficio',
    }),
  })
  .strict()
  .refine((d) => d.fecha_cierre >= d.fecha_apertura, {
    message: 'La fecha de cierre debe ser igual o posterior a la fecha de apertura',
    path: ['fecha_cierre'],
  });
export type CrearConvocatoriaInput = z.infer<typeof CrearConvocatoriaDto>;

export const ActualizarConvocatoriaDto = z
  .object({
    version: VersionSchema,
    anio: z.coerce.number().int().min(2024).max(2100).optional(),
    semestre: z.coerce.number().int().min(1).max(2).optional(),
    nombre: z.string().trim().min(3).max(200).optional(),
    descripcion: z.string().trim().max(5000).optional(),
    fecha_apertura: FechaLocalSchema.optional(),
    fecha_cierre: FechaLocalSchema.optional(),
    beneficios: z.array(BeneficioOfertadoDto).max(12).refine(beneficiosSinDuplicados, {
      message: 'No se puede ofertar dos veces el mismo beneficio',
    }).optional(),
  })
  .strict();
export type ActualizarConvocatoriaInput = z.infer<typeof ActualizarConvocatoriaDto>;

/** Transiciones simples: `version` opcional para bloqueo optimista. */
export const VersionOpcionalDto = z.object({ version: VersionSchema.optional() }).strict();
export type VersionOpcionalInput = z.infer<typeof VersionOpcionalDto>;

export const DeshabilitarDto = z
  .object({
    motivo: MotivoSchema,
    confirmar: ConfirmarSchema,
    version: VersionSchema.optional(),
  })
  .strict();
export type DeshabilitarInput = z.infer<typeof DeshabilitarDto>;

export const AmpliarDto = z
  .object({
    fecha_cierre_nueva: FechaLocalSchema,
    motivo: MotivoSchema,
    confirmar: ConfirmarSchema,
    version: VersionSchema.optional(),
  })
  .strict();
export type AmpliarInput = z.infer<typeof AmpliarDto>;

export const ArchivarDto = z
  .object({
    confirmar: ConfirmarSchema,
    version: VersionSchema.optional(),
  })
  .strict();
export type ArchivarInput = z.infer<typeof ArchivarDto>;

export const DecisionAsignacionesSchema = z.enum(['LIBERAR', 'MANTENER']);
export type DecisionAsignaciones = z.infer<typeof DecisionAsignacionesSchema>;

export const ComiteDto = z
  .object({
    funcionario_ids: z
      .array(UuidSchema)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Hay funcionarios repetidos' }),
    /** Obligatorio cuando un funcionario retirado tiene expedientes en curso (DECISIONES section 18). */
    asignaciones: DecisionAsignacionesSchema.optional(),
  })
  .strict();
export type ComiteInput = z.infer<typeof ComiteDto>;

export const ListarConvocatoriasQueryDto = PaginacionQuerySchema.extend({
  estado: EstadoConvocatoriaSchema.optional(),
  anio: z.coerce.number().int().min(2024).max(2100).optional(),
  semestre: z.coerce.number().int().min(1).max(2).optional(),
  /** `true`: solo convocatorias abiertas (estado operativo en tiempo real). */
  abiertas: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type ListarConvocatoriasQuery = z.infer<typeof ListarConvocatoriasQueryDto>;
