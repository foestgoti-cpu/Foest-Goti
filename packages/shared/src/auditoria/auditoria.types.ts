import type { Rol } from '../enums';
import type { ActorTipoAuditoria, OrigenVerificacionAuditoria, ResultadoAuditoria } from './auditoria.enums';

/**
 * Tipos de respuesta del modulo auditoria (API -> web).
 * `accion` y `entidad` se tipan como `string` en la lectura porque la bitacora
 * conserva eventos historicos aunque el catalogo evolucione.
 */
export interface AuditoriaEvento {
  id: string;
  secuencia: number;
  actor_id: string | null;
  actor_tipo: ActorTipoAuditoria | string;
  actor_rol: Rol | string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  resultado: ResultadoAuditoria | string;
  datos_antes: unknown;
  datos_despues: unknown;
  metadatos: Record<string, unknown>;
  request_id: string | null;
  sesion_id: string | null;
  ip_origen: string | null;
  user_agent: string | null;
  hash_previo: string | null;
  hash_evento: string | null;
  registrado_en: string;
}

/** `GET /auditoria/catalogo`. */
export interface CatalogoAuditoria {
  acciones: readonly string[];
  entidades: readonly string[];
  resultados: readonly string[];
}

/** `GET /auditoria/entidad/:entidad/:id`. */
export interface LineaTiempoAuditoria {
  data: AuditoriaEvento[];
  total: number;
}

/** Fila de `auditoria_integridad` (resultado de una verificacion de la cadena de hashes). */
export interface AuditoriaIntegridad {
  id: string;
  secuencia_desde: number | null;
  secuencia_hasta: number | null;
  total_verificados: number;
  valida: boolean;
  primera_secuencia_rota: number | null;
  detalle: string | null;
  origen: OrigenVerificacionAuditoria | string;
  verificada_en: string;
}

/** `GET /auditoria/integridad`. */
export interface EstadoIntegridadAuditoria {
  /** Ultima verificacion registrada; `null` si el job nunca ha corrido. */
  ultima: AuditoriaIntegridad | null;
  /** Secuencia mas alta registrada en la bitacora (para saber cuanto falta por verificar). */
  secuencia_actual: number | null;
  /** Eventos registrados despues de la ultima verificacion. */
  pendientes_verificacion: number;
  /** Ultimas verificaciones (mas reciente primero). */
  historial: AuditoriaIntegridad[];
  /** Estado de la cola de eventos fuera de transaccion. */
  cola: { encolados: number; fallidos: number };
}
