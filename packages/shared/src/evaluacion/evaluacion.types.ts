import type { CodigoBeneficio, EstadoPostulacion, TipoSolicitud } from '../enums';
import type {
  DecisionBeneficio,
  ModoExpediente,
  ResultadoDictamen,
  ResultadoDocumento,
} from './evaluacion.enums';

/**
 * DTOs de RESPUESTA del modulo `evaluacion`. Todos son para el personal (funcionario /
 * administrador). Lo que llega al beneficiario se arma aparte con `ObservacionPublica`
 * (sin ningun campo de actor).
 */

/** Soporte cargado (si existe) para un tipo de documento, tal como lo ve el evaluador. */
export interface DocumentoCargadoDto {
  documento_id: string;
  version: number;
  /** SUBIENDO | ESCANEANDO | DISPONIBLE | RECHAZADO_ARCHIVO. Solo DISPONIBLE admite PRESENTA. */
  estado_carga: string;
}

/** Fila del chequeo documental guardado (por tipo de documento). */
export interface ChequeoItemDto {
  tipo_codigo: string;
  resultado: ResultadoDocumento;
  observacion: string | null;
  /** Nulos si el soporte nunca se cargo. */
  documento_id: string | null;
  documento_version: number | null;
  verificado_en: string;
}

/** Tipo de documento exigible a la postulacion, con su soporte y su calificacion. */
export interface DocumentoExpedienteDto {
  tipo_codigo: string;
  tipo_nombre: string;
  /** Algun beneficio solicitado lo exige como obligatorio para el tipo de tramite. */
  obligatorio: boolean;
  beneficios_obligatorios: CodigoBeneficio[];
  beneficios_opcionales: CodigoBeneficio[];
  /** `null` si el soporte no se cargo. */
  documento: DocumentoCargadoDto | null;
  /** Calificacion del chequeo vigente; `null` si aun no se califica. */
  resultado: ResultadoDocumento | null;
  observacion: string | null;
}

export interface BeneficioExpedienteDto {
  codigo: CodigoBeneficio;
  nombre: string | null;
  valor_apoyo_referencial: number | null;
  /** Codigos de los tipos de documento obligatorios para aprobar ESTE beneficio. */
  documentos_obligatorios: string[];
}

export interface DatosPagoEnmascaradosDto {
  tipo: string;
  entidad: string;
  /** Ejemplo: "•••• 1234". El numero completo nunca sale de la API. */
  numero_enmascarado: string;
}

export interface ChequeoVigenteDto {
  /** `null` mientras no se haya guardado ningun chequeo del ciclo. */
  revision_id: string | null;
  ciclo: number;
  iniciada_en: string | null;
  decidida_en: string | null;
  items: ChequeoItemDto[];
}

export interface RevisionBeneficioDto {
  codigo: CodigoBeneficio;
  decision: DecisionBeneficio;
  motivo: string | null;
  monto_aprobado: number | null;
}

/** Revision (ciclo) decidida, para el historial. Solo el administrador recibe `funcionario`. */
export interface RevisionHistorialDto {
  revision_id: string;
  ciclo: number;
  resultado: ResultadoDictamen;
  observaciones: string | null;
  campos_observados: string[];
  documentos_observados: string[];
  fecha_limite_subsanacion: string | null;
  version_postulacion: number | null;
  iniciada_en: string;
  decidida_en: string;
  beneficios: RevisionBeneficioDto[];
  documentos: ChequeoItemDto[];
  /** `true` si la revision la emitio quien consulta (siempre `false` para el administrador). */
  propia: boolean;
  /** Solo administrador. */
  funcionario?: { id: string; nombres: string | null; apellidos: string | null } | null;
}

export interface LaborSocialResumenDto {
  /** Horas acumuladas del estudiante; informativo. */
  total_horas_acumuladas: number;
  horas_minimas_requeridas: number | null;
  estado: string | null;
}

export interface ConfiguracionSubsanacionDto {
  dias_habiles: number;
  dias_habiles_max: number;
  /** YYYY-MM-DD: fecha sugerida por defecto (hoy + dias_habiles dias habiles). */
  fecha_limite_sugerida: string;
  /** YYYY-MM-DD: ultima fecha que admite el servidor (hoy + dias_habiles_max dias habiles). */
  fecha_limite_maxima: string;
}

export interface PostulacionEvaluacionDto {
  id: string;
  convocatoria_id: string;
  convocatoria_nombre: string | null;
  tipo_solicitud: TipoSolicitud;
  estado: EstadoPostulacion;
  ciclo: number;
  /** Debe enviarse en PUT chequeo y POST dictamen (bloqueo optimista). */
  version: number;
  aprobacion_parcial: boolean;
  fecha_limite_subsanacion: string | null;
  enviada_en: string | null;
}

/** `GET /evaluacion/postulaciones/:id` */
export interface ExpedienteEvaluacionDto {
  postulacion: PostulacionEvaluacionDto;
  modo: ModoExpediente;
  /** Formulario GE-F041 tal como se envio en el ciclo vigente. */
  formulario: Record<string, unknown>;
  /** Perfil congelado del beneficiario en el ciclo vigente. */
  perfil_snapshot: Record<string, unknown> | null;
  beneficios: BeneficioExpedienteDto[];
  /** `false` si el modulo de documentos aun no esta desplegado (lista vacia). */
  documentos_disponibles: boolean;
  documentos: DocumentoExpedienteDto[];
  chequeo: ChequeoVigenteDto;
  /** Revisiones decididas de ciclos anteriores. */
  decisiones_previas: RevisionHistorialDto[];
  /** `null` si labor social no esta disponible o el estudiante no tiene registro. */
  labor_social: LaborSocialResumenDto | null;
  /** Solo si se solicito ST. */
  datos_pago: DatosPagoEnmascaradosDto | null;
  subsanacion: ConfiguracionSubsanacionDto;
}

export interface AdvertenciaDictamenDto {
  codigo: 'MONTO_EXCEDE_REFERENCIAL' | 'OTORGAMIENTO_NO_CREADO';
  beneficio: CodigoBeneficio | null;
  mensaje: string;
}

/** `POST /evaluacion/postulaciones/:id/dictamen` */
export interface DictamenRespuestaDto {
  revision_id: string;
  postulacion_id: string;
  ciclo: number;
  resultado: ResultadoDictamen;
  estado: EstadoPostulacion;
  version: number;
  aprobacion_parcial: boolean;
  fecha_limite_subsanacion: string | null;
  decidida_en: string;
  beneficios: RevisionBeneficioDto[];
  advertencias: AdvertenciaDictamenDto[];
}

/** `PUT /evaluacion/postulaciones/:id/chequeo` */
export interface ChequeoGuardadoDto {
  postulacion_id: string;
  /** Version de la postulacion (el chequeo no la incrementa). */
  version: number;
  chequeo: ChequeoVigenteDto;
}

/** `GET /evaluacion/postulaciones/:id/historial-revisiones` */
export interface HistorialRevisionesDto {
  postulacion_id: string;
  data: RevisionHistorialDto[];
}

/**
 * Lo que recibe el beneficiario de un dictamen (lista blanca; sin funcionario_id, nombres ni
 * asignacion). Se guarda en `postulacion.correccion_vigente` y lo sirve el serializador
 * `observacionPublica` de postulaciones.
 */
export interface ObservacionPublicaDictamen {
  firma: 'Equipo FOEST';
  ciclo: number;
  resultado: ResultadoDictamen;
  observaciones: string | null;
  campos_observados: string[];
  documentos_observados: string[];
  fecha_limite_subsanacion: string | null;
  beneficios: Array<{
    codigo: CodigoBeneficio;
    decision: DecisionBeneficio;
    motivo: string | null;
    monto_aprobado: number | null;
  }>;
  decidida_en: string;
}
