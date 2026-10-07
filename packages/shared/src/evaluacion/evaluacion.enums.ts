import { z } from 'zod';

/**
 * Enums del modulo `evaluacion` (docs/modules/evaluacion.md, DECISIONES secciones 9 y 18).
 * `as const` + Zod, mismo patron que `enums.ts` (sin `enum` de TypeScript).
 */

/** Vocabulario unico de la revision documental, calificado por TIPO de documento. */
export const RESULTADOS_DOCUMENTO = ['PRESENTA', 'NO_PRESENTA', 'NO_APLICA'] as const;
export const ResultadoDocumentoSchema = z.enum(RESULTADOS_DOCUMENTO);
export type ResultadoDocumento = z.infer<typeof ResultadoDocumentoSchema>;
export const ResultadoDocumento = {
  PRESENTA: 'PRESENTA',
  NO_PRESENTA: 'NO_PRESENTA',
  NO_APLICA: 'NO_APLICA',
} as const satisfies Record<ResultadoDocumento, ResultadoDocumento>;

/** Resultado del dictamen unico (`POST /evaluacion/postulaciones/:id/dictamen`). */
export const RESULTADOS_DICTAMEN = ['APROBAR', 'RECHAZAR', 'CORRECCION'] as const;
export const ResultadoDictamenSchema = z.enum(RESULTADOS_DICTAMEN);
export type ResultadoDictamen = z.infer<typeof ResultadoDictamenSchema>;
export const ResultadoDictamen = {
  APROBAR: 'APROBAR',
  RECHAZAR: 'RECHAZAR',
  CORRECCION: 'CORRECCION',
} as const satisfies Record<ResultadoDictamen, ResultadoDictamen>;

/** Decision por beneficio (aprobacion parcial). */
export const DECISIONES_BENEFICIO = ['APROBADO', 'RECHAZADO'] as const;
export const DecisionBeneficioSchema = z.enum(DECISIONES_BENEFICIO);
export type DecisionBeneficio = z.infer<typeof DecisionBeneficioSchema>;
export const DecisionBeneficio = {
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
} as const satisfies Record<DecisionBeneficio, DecisionBeneficio>;

/** Resultados del chequeo que satisfacen un documento obligatorio al aprobar un beneficio. */
export const RESULTADOS_DOCUMENTO_CUMPLIDOS: readonly ResultadoDocumento[] = ['PRESENTA', 'NO_APLICA'];

/** Minimo de caracteres de observaciones (RECHAZAR/CORRECCION) y del motivo por beneficio rechazado. */
export const OBSERVACION_MIN_CARACTERES = 15;

/** Firma fija de todo lo que llega al beneficiario (anonimato del evaluador). */
export const FIRMA_EVALUACION = 'Equipo FOEST' as const;

/** Modo de apertura del expediente: ESCRITURA = titular de la asignacion activa; LECTURA = historico propio o administrador. */
export const MODOS_EXPEDIENTE = ['ESCRITURA', 'LECTURA'] as const;
export type ModoExpediente = (typeof MODOS_EXPEDIENTE)[number];

/** Codigos de error de negocio del modulo (campo `code` de la respuesta). */
export const CODIGOS_ERROR_EVALUACION = [
  'VERSION_CONFLICTO',
  'TRANSICION_INVALIDA',
  'DOCUMENTOS_OBLIGATORIOS_PENDIENTES',
  'BENEFICIOS_INCOMPLETOS',
  'BENEFICIO_NO_SOLICITADO',
  'TIPO_DOCUMENTO_NO_APLICABLE',
  'DOCUMENTO_NO_DISPONIBLE',
  'FECHA_LIMITE_INVALIDA',
] as const;
export type CodigoErrorEvaluacion = (typeof CODIGOS_ERROR_EVALUACION)[number];
