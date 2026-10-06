import type { ActorTipo, CodigoBeneficio, EstadoPostulacion, MotivoTransicion, TipoSolicitud } from '@foest/shared';

/** Fila de `postulacion` tal como la devuelve Supabase. */
export interface PostulacionRow {
  id: string;
  beneficiario_id: string;
  convocatoria_id: string;
  tipo_solicitud: TipoSolicitud;
  estado: EstadoPostulacion;
  datos_formulario: Record<string, unknown>;
  correcciones_perfil: Record<string, unknown> | null;
  correccion_vigente: CorreccionVigente | null;
  valor_matricula_letras: string | null;
  ciclo: number;
  version: number;
  aprobacion_parcial: boolean;
  fecha_limite_subsanacion: string | null;
  enviada_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

/** Lo que `evaluacion` guarda al emitir CORRECCION (se expone al beneficiario sin actor). */
export interface CorreccionVigente {
  observaciones?: string;
  campos_observados?: string[];
  documentos_observados?: string[];
  /** Campos internos que NUNCA se serializan al beneficiario. */
  actor_id?: string;
  actor_tipo?: string;
  [k: string]: unknown;
}

export interface ConvocatoriaResumen {
  id: string;
  nombre: string;
  anio: number;
  semestre: number;
  estado: string;
  fecha_apertura: string;
  fecha_cierre_exclusiva: string;
  /** Codigos ofertados en CONVOCATORIA_BENEFICIO (se completa en el detalle y en convocatorias-abiertas). */
  beneficios_ofertados?: CodigoBeneficio[];
}

export interface HistorialRow {
  id: string;
  postulacion_id: string;
  ciclo: number;
  estado_anterior: EstadoPostulacion | null;
  estado_nuevo: EstadoPostulacion;
  motivo: MotivoTransicion | string;
  actor_tipo: ActorTipo;
  actor_id: string | null;
  observaciones: string | null;
  cambiado_en: string;
}

export interface BeneficiarioRow {
  id: string;
  usuario_id: string;
  perfil_completo: boolean;
  es_menor: boolean;
  nombres: string | null;
  apellidos: string | null;
  numero_documento: string | null;
  tipo_documento: string | null;
  [k: string]: unknown;
}

export interface DeclaracionVigente {
  codigo: string;
  version: number;
  titulo: string;
  texto: string;
  texto_oficial_confirmado: boolean;
}

export interface ResultadoEnvio {
  postulacion_id: string;
  estado: EstadoPostulacion;
  ciclo: number;
  version: number;
  hash_envio: string;
  enviado_en: string;
  repetido: boolean;
}

export interface OpcionesTransicion {
  actor: { tipo: ActorTipo; id?: string | null };
  motivo: MotivoTransicion;
  observaciones?: string | null;
  versionEsperada?: number | null;
  payload?: {
    fecha_limite_subsanacion?: string;
    correccion_vigente?: CorreccionVigente;
    aprobacion_parcial?: boolean;
  };
  /** Contexto de auditoria (ip, user agent, request id). */
  contexto?: { ip?: string | null; user_agent?: string | null; request_id?: string | null; actor_rol?: 'ADMINISTRADOR' | 'FUNCIONARIO' | 'BENEFICIARIO' | null };
}

export type BeneficiosSeleccionados = CodigoBeneficio[];
