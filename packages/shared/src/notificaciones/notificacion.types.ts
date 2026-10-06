import type { Paginado } from '../api';
import type {
  CodigoRebote,
  EstadoEntregaCorreo,
  EstadoOutbox,
  MotivoSupresion,
  RolDestinatario,
  SeveridadNotificacion,
} from './notificacion.enums';

/** Fila del buzon tal como la devuelve `GET /notificaciones/me` (contrato vigente + `creada_en_texto`). */
export interface NotificacionDTO {
  id: string;
  usuario_id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  entidad: string | null;
  entidad_id: string | null;
  url_destino: string | null;
  severidad: SeveridadNotificacion;
  leida: boolean;
  leida_en: string | null;
  creada_en: string;
  creada_en_texto: string;
}

export interface ContadorNotificacionesDTO {
  no_leidas: number;
  criticas_no_leidas: number;
}

export interface PreferenciasNotificacionDTO {
  usuario_id: string;
  correo_recordatorios: boolean;
  correo_informativos: boolean;
  actualizado_en: string | null;
}

export interface EventoOutboxDTO {
  id: string;
  notificacion_id: string | null;
  usuario_id: string | null;
  tipo: string;
  plantilla_version: number;
  estado: EstadoOutbox;
  intentos: number;
  proximo_intento_en: string | null;
  ultimo_error: string | null;
  clave_idempotencia: string;
  creado_en: string;
  tomado_en: string | null;
  procesado_en: string | null;
  /** Asunto renderizado (sin cuerpo ni enlaces). */
  asunto: string | null;
}

export type ConteosOutbox = Record<EstadoOutbox, number>;

export interface OutboxListadoDTO extends Paginado<EventoOutboxDTO> {
  conteos: ConteosOutbox;
  /** Segundos desde el evento PENDIENTE mas antiguo (0 si no hay). */
  edad_pendiente_mas_antiguo_seg: number;
}

export interface EntregaCorreoDTO {
  id: string;
  evento_outbox_id: string;
  tipo: string | null;
  destinatario_email: string;
  rol_destinatario: RolDestinatario;
  estado: EstadoEntregaCorreo;
  id_mensaje_proveedor: string | null;
  codigo_rebote: CodigoRebote | null;
  detalle_rebote: string | null;
  enviado_en: string;
  actualizado_en: string;
}

export interface DestinatarioSuprimidoDTO {
  email: string;
  motivo: MotivoSupresion;
  desde: string;
  levantado_por: string | null;
  levantado_en: string | null;
}

export interface ResumenEntregabilidadDTO {
  generado_en: string;
  ultimas_24h: { enviadas: number; entregadas: number; rebotadas: number; quejas: number; fallidas: number };
  totales: { rebotadas: number; quejas: number; suprimidos_activos: number };
  outbox: ConteosOutbox & { edad_pendiente_mas_antiguo_seg: number };
  suprimidos: DestinatarioSuprimidoDTO[];
}

export interface ResultadoWebhookCorreoDTO {
  recibidos: number;
  procesados: number;
  ignorados: number;
}
