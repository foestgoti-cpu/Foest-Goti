/** Tipos de respuesta de `/api/v1/notificaciones/*` (contratos en @foest/shared). */
export type {
  NotificacionDTO as Notificacion,
  ContadorNotificacionesDTO as ContadorNotificaciones,
  PreferenciasNotificacionDTO as PreferenciasNotificacion,
  PreferenciasNotificacionInput,
  EventoOutboxDTO as EventoOutbox,
  OutboxListadoDTO as OutboxListado,
  EntregaCorreoDTO as EntregaCorreo,
  DestinatarioSuprimidoDTO as DestinatarioSuprimido,
  ResumenEntregabilidadDTO as ResumenEntregabilidad,
  EstadoOutbox,
  EstadoEntregaCorreo,
  SeveridadNotificacion,
} from '@foest/shared';

export interface FiltrosBuzon {
  page?: number;
  page_size?: number;
  leida?: boolean;
  severidad?: string;
  tipo?: string;
}

export interface FiltrosOutbox {
  page?: number;
  page_size?: number;
  estado?: string;
  tipo?: string;
}

export interface FiltrosEntregas {
  page?: number;
  page_size?: number;
  estado?: string;
  email?: string;
}
