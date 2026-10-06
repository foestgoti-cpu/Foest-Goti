import type { AuditoriaEvento, AuditoriaIntegridad } from '@foest/shared';
import type { EventoAuditoria } from '../../shared';

/** Fila de `auditoria_evento` tal como la devuelve Supabase. */
export type AuditoriaEventoRow = AuditoriaEvento;

/** Fila de `auditoria_integridad`. */
export type AuditoriaIntegridadRow = AuditoriaIntegridad;

/** Evento serializado en la cola `auditoria_evento_pendiente` (conserva el instante original). */
export interface EventoPendiente extends EventoAuditoria {
  /** Instante original del evento (ISO); se conserva como `registrado_en` al procesarlo. */
  registrado_en: string;
}

export interface AuditoriaPendienteRow {
  id: string;
  evento: EventoPendiente;
  estado: 'ENCOLADO' | 'PROCESADO' | 'FALLIDO';
  intentos: number;
  ultimo_error: string | null;
  proximo_intento_en: string;
  creado_en: string;
  procesado_en: string | null;
  evento_id: string | null;
}

/** Resultado de `fn_auditoria_resumen_integridad`. */
export interface ResumenIntegridadRpc {
  secuencia_actual: number | null;
  pendientes_verificacion: number;
  cola: { encolados: number; fallidos: number };
}

/** Resultado de `fn_auditoria_candidatos_retencion`. */
export interface CandidatosRetencionRpc {
  retencion_anios: number;
  limite: string;
  candidatos: number;
  secuencia_max_candidata: number | null;
}

export interface ExportacionAuditoria {
  nombre_archivo: string;
  tipo_contenido: string;
  contenido: string;
  filas: number;
}
