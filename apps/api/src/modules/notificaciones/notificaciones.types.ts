import type {
  CodigoRebote,
  EntidadNotificacion,
  EstadoEntregaCorreo,
  EstadoOutbox,
  MotivoSupresion,
  RolDestinatario,
  SeveridadNotificacion,
  TipoNotificacion,
} from '@foest/shared';

/** Filas de BD del modulo (0001_base.sql `notificacion` y 0012_notificaciones.sql). */

export interface FilaNotificacion {
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
}

export interface FilaPreferencia {
  usuario_id: string;
  correo_recordatorios: boolean;
  correo_informativos: boolean;
  actualizado_en: string;
}

/** Variables de plantilla: solo primitivos (sin objetos anidados para evitar fugas de datos). */
export type PayloadOutbox = Record<string, string | number | boolean | null>;

export interface FilaEventoOutbox {
  id: string;
  notificacion_id: string | null;
  usuario_id: string | null;
  tipo: string;
  plantilla_version: number;
  payload: PayloadOutbox;
  estado: EstadoOutbox;
  intentos: number;
  proximo_intento_en: string;
  ultimo_error: string | null;
  clave_idempotencia: string;
  creado_en: string;
  tomado_en: string | null;
  procesado_en: string | null;
}

export interface FilaEntregaCorreo {
  id: string;
  evento_outbox_id: string;
  destinatario_email: string;
  rol_destinatario: RolDestinatario;
  estado: EstadoEntregaCorreo;
  id_mensaje_proveedor: string | null;
  codigo_rebote: CodigoRebote | null;
  detalle_rebote: string | null;
  enviado_en: string;
  actualizado_en: string;
}

export interface FilaDestinatarioSuprimido {
  email: string;
  motivo: MotivoSupresion;
  detalle: string | null;
  desde: string;
  levantado_por: string | null;
  levantado_en: string | null;
}

/** Entrada publica de `encolarNotificacion` (index.ts). */
export interface EncolarNotificacionInput {
  usuario_id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  entidad?: EntidadNotificacion | null;
  entidad_id?: string | null;
  url_destino?: string | null;
  severidad?: SeveridadNotificacion;
  /** Evita duplicar recordatorios: UNIQUE(usuario_id, clave_dedup). */
  clave_dedup?: string | null;
  /** Fuerza o suprime el correo; por defecto decide el catalogo del tipo. */
  correo?: boolean;
  /** Variables adicionales de la plantilla (sin datos del evaluador ni secretos). */
  payload?: PayloadOutbox;
  /** Clave de idempotencia del correo; por defecto se deriva de tipo + usuario + clave_dedup/notificacion. */
  clave_idempotencia?: string;
  /** Correos adicionales (p. ej. acudiente conocido por el modulo llamador). */
  destinatarios_extra?: string[];
}

export interface EncolarNotificacionResultado {
  notificacion_id: string | null;
  evento_outbox_id: string | null;
  /** `true` si la notificacion ya existia (clave_dedup) y no se creo nada nuevo. */
  duplicada: boolean;
  /** Motivo por el que no se encolo correo (preferencia, tipo sin correo, duplicado). */
  correo_omitido: 'TIPO_SIN_CORREO' | 'PREFERENCIA' | 'DUPLICADO' | 'DESACTIVADO' | null;
}

export interface Destinatario {
  email: string;
  rol: RolDestinatario;
}

/** Fuente de recordatorios registrada por otros modulos (patron ReminderSource). */
export interface FuenteRecordatorio {
  nombre: string;
  ejecutar: (ahora: Date) => Promise<EncolarNotificacionInput[]>;
}
