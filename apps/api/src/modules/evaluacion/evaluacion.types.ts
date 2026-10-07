import type { CodigoBeneficio, DecisionBeneficio, EstadoPostulacion, ResultadoDictamen, ResultadoDocumento, TipoSolicitud } from '@foest/shared';

/**
 * Tipos internos del modulo `evaluacion` (filas de BD tal como las devuelve Supabase).
 * Ninguno de estos tipos sale de la API hacia el beneficiario: `revision.funcionario_id` es interno.
 */

export interface PostulacionEvalRow {
  id: string;
  beneficiario_id: string;
  convocatoria_id: string;
  tipo_solicitud: TipoSolicitud;
  estado: EstadoPostulacion;
  ciclo: number;
  version: number;
  aprobacion_parcial: boolean;
  fecha_limite_subsanacion: string | null;
  enviada_en: string | null;
  datos_formulario: Record<string, unknown> | null;
  correccion_vigente: Record<string, unknown> | null;
}

export interface RevisionRow {
  id: string;
  postulacion_id: string;
  postulacion_envio_id: string | null;
  ciclo: number;
  /** INTERNO. */
  funcionario_id: string;
  asignacion_id: string | null;
  resultado: ResultadoDictamen | null;
  observaciones: string | null;
  campos_observados: string[] | null;
  documentos_observados: string[] | null;
  fecha_limite_subsanacion: string | null;
  version_postulacion: number | null;
  iniciada_en: string;
  decidida_en: string | null;
}

export interface RevisionDocumentoRow {
  id: string;
  revision_id: string;
  tipo_id: string;
  documento_id: string | null;
  documento_version: number | null;
  resultado: ResultadoDocumento;
  observacion_especifica: string | null;
  verificado_en: string;
}

export interface RevisionBeneficioRow {
  id: string;
  revision_id: string;
  beneficio_codigo: CodigoBeneficio;
  decision: DecisionBeneficio;
  motivo: string | null;
  monto_aprobado: number | string | null;
}

/** Fila de requisito (beneficio x tipo de documento) para la postulacion. */
export interface RequisitoRow {
  tipo_id: string;
  tipo_codigo: string;
  tipo_nombre: string;
  beneficio_codigo: CodigoBeneficio;
  obligatorio: boolean;
}

/** Soporte cargado (documento vigente por tipo). */
export interface SoporteRow {
  documento_id: string;
  tipo_id: string;
  tipo_codigo: string;
  version: number;
  estado_carga: string;
}

export interface RequisitosPostulacion {
  /** `false` si el modulo de documentos no esta desplegado o su esquema no es el esperado. */
  disponible: boolean;
  requisitos: RequisitoRow[];
  documentos: SoporteRow[];
  error?: string;
}

/** Tipo de documento exigible agrupado (varios beneficios pueden exigir el mismo tipo). */
export interface TipoExigible {
  tipo_id: string;
  tipo_codigo: string;
  tipo_nombre: string;
  beneficios_obligatorios: CodigoBeneficio[];
  beneficios_opcionales: CodigoBeneficio[];
}
