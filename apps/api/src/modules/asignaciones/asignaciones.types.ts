import type { AlcanceExpedienteDto, EstadoAsignacion, EstadoPostulacion, MotivoLiberacion, OrigenAsignacion, TipoSolicitud } from '@foest/shared';
import type { EventoAuditoria } from '../../shared';

/** Contexto de auditoria de una peticion (ip, user agent, request id, actor). */
export type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

/** Fila de `public.postulacion_asignacion` (0016). */
export interface FilaAsignacion {
  id: string;
  postulacion_id: string;
  funcionario_id: string;
  estado: EstadoAsignacion;
  ciclo: number;
  origen: OrigenAsignacion;
  motivo_liberacion: MotivoLiberacion | null;
  observacion_liberacion: string | null;
  asignada_en: string;
  asignada_por: string | null;
  liberada_en: string | null;
  liberada_por: string | null;
  ultimo_movimiento_en: string;
  ultima_alerta_en: string | null;
}

/** Fila de `public.conflicto_interes` (0016). */
export interface FilaConflicto {
  id: string;
  postulacion_id: string;
  funcionario_id: string;
  asignacion_id: string | null;
  motivo: string;
  declarado_en: string;
}

/** Datos minimos de la postulacion que usa el modulo (sin datos personales). */
export interface ContextoPostulacion {
  id: string;
  estado: EstadoPostulacion;
  version: number;
  ciclo: number;
  tipo_solicitud: TipoSolicitud;
  convocatoria_id: string;
  convocatoria_nombre: string;
  convocatoria_anio: number;
  convocatoria_semestre: number;
  /** usuario.id del beneficiario (solo para notificarle; nunca se expone). */
  beneficiario_usuario_id: string | null;
  codigo_expediente: string;
}

/** Fila devuelta por `fn_asignacion_bandeja`. */
export interface FilaBandeja {
  postulacion_id: string;
  convocatoria_id: string;
  convocatoria_nombre: string;
  convocatoria_anio: number;
  convocatoria_semestre: number;
  tipo_solicitud: TipoSolicitud;
  estado: EstadoPostulacion;
  ciclo: number;
  version: number;
  enviada_en: string | null;
  beneficios: string[];
  asignacion_estado: EstadoAsignacion | null;
  asignada_en: string | null;
  total: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Alcance sobre el expediente resuelto por `requireExpedienteScope`. */
      alcanceExpediente?: AlcanceExpedienteDto;
    }
  }
}

export {};
