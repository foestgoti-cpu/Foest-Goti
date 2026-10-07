import { z } from 'zod';
import { CodigoBeneficioSchema } from '../enums';
import { ConfirmarSchema, FechaLocalSchema, VersionSchema } from '../schemas';
import {
  DecisionBeneficioSchema,
  OBSERVACION_MIN_CARACTERES,
  ResultadoDictamenSchema,
  ResultadoDocumentoSchema,
} from './evaluacion.enums';

/**
 * Esquemas de ENTRADA del modulo `evaluacion` (los usan la API y el formulario web).
 * Las reglas que dependen de la base de datos (beneficios solicitados, documentos
 * obligatorios, dias habiles) las aplica el servicio y responden 422 / 409.
 */

const textoCorto = z.string().trim().max(2000);

// --- PUT /evaluacion/postulaciones/:id/chequeo ---------------------------------------------
export const ChequeoItemInputSchema = z
  .object({
    /** Codigo del tipo de documento (p. ej. FORM_INS). El chequeo es por TIPO, no por archivo. */
    tipo_codigo: z.string().trim().min(1).max(40),
    resultado: ResultadoDocumentoSchema,
    observacion: textoCorto.nullish(),
  })
  .strict();
export type ChequeoItemInput = z.infer<typeof ChequeoItemInputSchema>;

export const ChequeoInputSchema = z
  .object({
    version: VersionSchema,
    items: z.array(ChequeoItemInputSchema).min(1).max(60),
  })
  .strict()
  .superRefine((v, ctx) => {
    const vistos = new Set<string>();
    v.items.forEach((item, i) => {
      if (vistos.has(item.tipo_codigo)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', i, 'tipo_codigo'], message: 'Tipo de documento repetido' });
      }
      vistos.add(item.tipo_codigo);
    });
  });
export type ChequeoInput = z.infer<typeof ChequeoInputSchema>;

// --- POST /evaluacion/postulaciones/:id/dictamen ---------------------------------------------
export const DictamenBeneficioInputSchema = z
  .object({
    codigo: CodigoBeneficioSchema,
    decision: DecisionBeneficioSchema,
    motivo: textoCorto.nullish(),
    monto_aprobado: z.number().positive().max(1_000_000_000_000).nullish(),
  })
  .strict();
export type DictamenBeneficioInput = z.infer<typeof DictamenBeneficioInputSchema>;

export const DictamenInputSchema = z
  .object({
    version: VersionSchema,
    confirmar: ConfirmarSchema,
    resultado: ResultadoDictamenSchema,
    beneficios: z.array(DictamenBeneficioInputSchema).max(12).default([]),
    observaciones: z.string().trim().max(4000).default(''),
    campos_observados: z.array(z.string().trim().min(1).max(200)).max(60).optional(),
    documentos_observados: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    /** YYYY-MM-DD (dia habil). Solo en CORRECCION; por defecto hoy + SUBSANACION_DIAS_HABILES dias habiles. */
    fecha_limite_subsanacion: FechaLocalSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    const codigos = new Set<string>();
    v.beneficios.forEach((b, i) => {
      if (codigos.has(b.codigo)) issue(['beneficios', i, 'codigo'], 'Beneficio repetido');
      codigos.add(b.codigo);
    });

    if ((v.resultado === 'RECHAZAR' || v.resultado === 'CORRECCION') && v.observaciones.length < OBSERVACION_MIN_CARACTERES) {
      issue(['observaciones'], `Las observaciones deben tener al menos ${OBSERVACION_MIN_CARACTERES} caracteres`);
    }

    if (v.resultado === 'CORRECCION') {
      const hayCampos = (v.campos_observados?.length ?? 0) > 0;
      const hayDocs = (v.documentos_observados?.length ?? 0) > 0;
      if (!hayCampos && !hayDocs) {
        issue(['campos_observados'], 'Indique al menos un campo o un documento observado');
      }
      return;
    }

    if (v.fecha_limite_subsanacion) {
      issue(['fecha_limite_subsanacion'], 'La fecha limite de subsanacion solo aplica al resultado CORRECCION');
    }
    if (v.beneficios.length === 0) {
      issue(['beneficios'], 'Debe decidir cada beneficio solicitado');
    }

    v.beneficios.forEach((b, i) => {
      if (b.decision === 'RECHAZADO') {
        if ((b.motivo ?? '').trim().length < OBSERVACION_MIN_CARACTERES) {
          issue(['beneficios', i, 'motivo'], `El motivo debe tener al menos ${OBSERVACION_MIN_CARACTERES} caracteres`);
        }
      } else if (b.monto_aprobado == null) {
        issue(['beneficios', i, 'monto_aprobado'], 'El monto aprobado es obligatorio y mayor que cero');
      }
    });

    const aprobados = v.beneficios.filter((b) => b.decision === 'APROBADO').length;
    if (v.resultado === 'APROBAR' && aprobados === 0 && v.beneficios.length > 0) {
      issue(['beneficios'], 'APROBAR exige al menos un beneficio aprobado; si todos se rechazan use RECHAZAR');
    }
    if (v.resultado === 'RECHAZAR' && aprobados > 0) {
      issue(['beneficios'], 'RECHAZAR exige que todos los beneficios queden rechazados');
    }
  });
export type DictamenInput = z.infer<typeof DictamenInputSchema>;
