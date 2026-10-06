import { z } from 'zod';
import {
  BeneficiosSeleccionSchema,
  ConfirmarSchema,
  DatosPagoEntradaSchema,
  EstadoPostulacionSchema,
  FormularioParcialSchema,
  PaginacionQuerySchema,
  TipoSolicitudSchema,
  UuidSchema,
  VersionSchema,
} from '@foest/shared';

/** POST /postulaciones */
export const CrearPostulacionDto = z
  .object({
    convocatoria_id: UuidSchema,
    tipo_solicitud: TipoSolicitudSchema,
    beneficios: BeneficiosSeleccionSchema.optional(),
  })
  .strict();
export type CrearPostulacionInput = z.infer<typeof CrearPostulacionDto>;

/**
 * PUT /postulaciones/:id (autoguardado parcial).
 * `datos_formulario` admite solo las secciones enviadas; `datos_pago` llega en claro y se cifra.
 * `valor_matricula_letras` nunca se acepta del cliente (lo genera el servidor).
 */
export const GuardarPostulacionDto = z
  .object({
    version: VersionSchema,
    datos_formulario: FormularioParcialSchema.optional(),
    beneficios: BeneficiosSeleccionSchema.optional(),
    datos_pago: DatosPagoEntradaSchema.optional(),
  })
  .strict();
export type GuardarPostulacionInput = z.infer<typeof GuardarPostulacionDto>;

/** POST /postulaciones/:id/enviar y /subsanar */
export const EnviarPostulacionDto = z
  .object({
    confirmar: ConfirmarSchema,
    version: VersionSchema.optional(),
    declaraciones_aceptadas: z.array(z.string().regex(/^DECL_[1-6]$/)).max(6).default([]),
  })
  .strict();
export type EnviarPostulacionInput = z.infer<typeof EnviarPostulacionDto>;

/** POST /postulaciones/:id/desistir */
export const DesistirPostulacionDto = z
  .object({
    confirmar: ConfirmarSchema.optional(),
    version: VersionSchema.optional(),
    motivo: z.string().trim().max(2000).optional(),
  })
  .strict();
export type DesistirPostulacionInput = z.infer<typeof DesistirPostulacionDto>;

/** GET /postulaciones (administrador) */
export const ListadoAdminQueryDto = PaginacionQuerySchema.extend({
  convocatoria_id: UuidSchema.optional(),
  estado: EstadoPostulacionSchema.optional(),
  tipo_solicitud: TipoSolicitudSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListadoAdminQuery = z.infer<typeof ListadoAdminQueryDto>;

/** GET /postulaciones/me */
export const ListadoPropioQueryDto = PaginacionQuerySchema;
export type ListadoPropioQuery = z.infer<typeof ListadoPropioQueryDto>;
