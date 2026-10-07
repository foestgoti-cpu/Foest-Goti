import type { CodigoBeneficio, EstadoPostulacion, TipoSolicitud } from '../enums';
import type {
  AlcanceExpediente,
  EstadoAsignacion,
  EventoHistorialAsignacion,
  MotivoLiberacion,
  OrigenAsignacion,
} from './asignacion.enums';

/** Estado de la asignacion visto desde la bandeja: nunca se revela el nombre de otro funcionario. */
export interface AsignacionBandejaDto {
  estado: EstadoAsignacion;
  /** `yo` si es del solicitante; `otro` si es de otro funcionario; `null` si no hay asignacion (pool). */
  titular: 'yo' | 'otro' | null;
  asignada_en: string | null;
}

/**
 * Resumen minimo de la bandeja (lista blanca). NUNCA incluye nombre, documento, correo,
 * telefono, direccion, estrato, SISBEN, datos de pago ni contenido de documentos.
 */
export interface ResumenBandejaDto {
  postulacion_id: string;
  codigo_expediente: string;
  convocatoria_id: string;
  convocatoria_nombre: string;
  tipo_solicitud: TipoSolicitud;
  beneficios_solicitados: CodigoBeneficio[];
  estado: EstadoPostulacion;
  ciclo: number;
  enviada_en: string | null;
  dias_habiles_en_espera: number;
  asignacion: AsignacionBandejaDto | null;
  /** Version de la postulacion para el bloqueo optimista de tomar/liberar. */
  version: number;
}

/** Asignacion por expediente (respuesta de tomar, liberar, reasignar). */
export interface AsignacionDto {
  id: string;
  postulacion_id: string;
  codigo_expediente: string;
  funcionario_id: string | null;
  estado: EstadoAsignacion;
  motivo_liberacion: MotivoLiberacion | null;
  origen: OrigenAsignacion;
  asignada_en: string;
  liberada_en: string | null;
  ultimo_movimiento_en: string;
  /** Estado de la postulacion tras la operacion. */
  postulacion_estado: EstadoPostulacion;
  postulacion_version: number;
}

/** Resultado de declarar un conflicto de interes. */
export interface ConflictoInteresDto {
  postulacion_id: string;
  declarado_en: string;
  postulacion_estado: EstadoPostulacion;
}

/** GET /asignaciones/alertas (administrador). */
export interface AlertaAsignacionDto {
  asignacion_id: string;
  postulacion_id: string;
  codigo_expediente: string;
  convocatoria_id: string;
  convocatoria_nombre: string;
  funcionario_id: string;
  funcionario_nombre: string;
  funcionario_activo: boolean;
  en_comite: boolean;
  asignada_en: string;
  ultimo_movimiento_en: string;
  dias_habiles_sin_movimiento: number;
  /** `ALTA` si el titular esta inactivo o fuera del comite; `NORMAL` en otro caso. */
  prioridad: 'ALTA' | 'NORMAL';
  motivo: 'SIN_MOVIMIENTO' | 'TITULAR_INACTIVO' | 'FUERA_DE_COMITE';
}

/** GET /asignaciones/evaluadores (administrador): funcionarios del comite con su carga. */
export interface EvaluadorCargaDto {
  funcionario_id: string;
  nombre: string;
  email: string;
  activo: boolean;
  convocatoria_ids: string[];
  asignaciones_activas: number;
  /** `true` si esta excluido por conflicto de interes sobre `postulacion_id` (solo si se consulto una). */
  excluido?: boolean;
  /** `true` si pertenece al comite de la convocatoria de `postulacion_id` (solo si se consulto una). */
  en_comite_postulacion?: boolean;
}

/** GET /asignaciones/postulaciones/:id/historial. */
export interface HistorialAsignacionDto {
  id: string;
  evento: EventoHistorialAsignacion;
  funcionario_id: string;
  funcionario_nombre: string | null;
  ciclo: number | null;
  origen: OrigenAsignacion | null;
  motivo_liberacion: MotivoLiberacion | null;
  motivo: string | null;
  actor_id: string | null;
  ocurrido_en: string;
}

export interface OmitidaReasignacionDto {
  postulacion_id: string;
  codigo_expediente: string;
  motivo: string;
}

/** POST /asignaciones/reasignar-masivo. */
export interface ResultadoReasignacionMasivoDto {
  procesadas: number;
  reasignadas: number;
  devueltas_al_pool: number;
  omitidas: OmitidaReasignacionDto[];
}

/** Alcance resuelto por `requireExpedienteScope` (adjunto a `req.alcanceExpediente`). */
export interface AlcanceExpedienteDto {
  postulacion_id: string;
  alcance: AlcanceExpediente;
}
