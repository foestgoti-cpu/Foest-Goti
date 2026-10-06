import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import type { Rol } from '@foest/shared';

/**
 * Auditoria append-only (docs/modules/auditoria.md).
 *
 * `auditar(evento)` inserta en `public.auditoria_evento` con `supabaseAdmin`
 * (service role). La tabla tiene REVOKE UPDATE/DELETE y trigger de bloqueo.
 *
 * Nota de implementacion: en Supabase no hay transacciones multi-sentencia
 * desde el cliente JS; cuando una operacion de negocio deba ser atomica con su
 * evento de auditoria, el modulo debe implementarla como funcion SQL (RPC) que
 * inserte tambien en `auditoria_evento`. Para el resto de casos este helper es
 * suficiente y un fallo al auditar hace fallar la operacion (lanza).
 */

export type ResultadoAuditoria = 'EXITO' | 'FALLO' | 'DENEGADO';
export type ActorTipoAuditoria = 'USUARIO' | 'SISTEMA' | 'ANONIMO';

export interface EventoAuditoria {
  /** uuid del usuario actor; `null`/omitido para SISTEMA o ANONIMO. */
  actor_id?: string | null;
  actor_tipo?: ActorTipoAuditoria;
  actor_rol?: Rol | null;
  /** Catalogo cerrado de acciones (auditoria.md): CREAR, ACTUALIZAR, ENVIAR, LOGIN, LECTURA_SENSIBLE, ... */
  accion: string;
  /** Catalogo cerrado de entidades: USUARIO, CONVOCATORIA, POSTULACION, ... */
  entidad: string;
  entidad_id?: string | null;
  datos_antes?: unknown;
  datos_despues?: unknown;
  metadatos?: Record<string, unknown>;
  resultado?: ResultadoAuditoria;
  ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
  sesion_id?: string | null;
}

/** Claves que se eliminan por completo (clave y valor). */
const CLAVES_ELIMINAR = new Set([
  'password',
  'password_hash',
  'hash',
  'token',
  'refresh_token',
  'access_token',
  'token_hash',
  'codigo_recuperacion',
  'codigo_verificacion',
  'secreto',
  'secret',
  'api_key',
  'clave_privada',
  'service_role_key',
]);

/** Claves cuyo valor se enmascara a `[CIFRADO]`. */
const CLAVES_CIFRADAS = new Set(['numero_cifrado', 'payload_cifrado']);

/** Datos sensibles de perfil: se registra solo que cambiaron, sin el valor. */
const CLAVES_SENSIBLES = new Set([
  'sisben_categoria',
  'sisben_puntaje',
  'estrato',
  'discapacidad',
  'etnia',
  'victima',
  'numero_cuenta',
  'numero_billetera',
]);

const LIMITE_JSON_BYTES = 64 * 1024;

export function redactar(valor: unknown, profundidad = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (profundidad > 12) return '[PROFUNDIDAD]';
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1));
  if (typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      const clave = k.toLowerCase();
      if (CLAVES_ELIMINAR.has(clave)) continue;
      if (CLAVES_CIFRADAS.has(clave)) {
        salida[k] = '[CIFRADO]';
        continue;
      }
      if (CLAVES_SENSIBLES.has(clave)) {
        salida[k] = '[SENSIBLE]';
        continue;
      }
      if (clave === 'numero_documento' && typeof v === 'string') {
        salida[k] = `***${v.slice(-3)}`;
        continue;
      }
      salida[k] = redactar(v, profundidad + 1);
    }
    return salida;
  }
  return valor;
}

function limitar(valor: unknown): { valor: unknown; truncado: boolean } {
  if (valor === undefined || valor === null) return { valor: null, truncado: false };
  const texto = JSON.stringify(valor);
  if (Buffer.byteLength(texto, 'utf8') <= LIMITE_JSON_BYTES) return { valor, truncado: false };
  if (typeof valor === 'object' && !Array.isArray(valor)) {
    return { valor: { claves: Object.keys(valor as object) }, truncado: true };
  }
  return { valor: { truncado: true }, truncado: true };
}

function canonico(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonico).join(',')}]`;
  const claves = Object.keys(obj as Record<string, unknown>).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico((obj as Record<string, unknown>)[k])}`).join(',')}}`;
}

/**
 * Inserta el evento. Lanza si falla (la auditoria no es opcional).
 * Devuelve el id del evento insertado.
 */
export async function auditar(evento: EventoAuditoria): Promise<string> {
  const antes = limitar(redactar(evento.datos_antes));
  const despues = limitar(redactar(evento.datos_despues));
  const metadatos: Record<string, unknown> = { ...(evento.metadatos ?? {}) };
  if (antes.truncado || despues.truncado) metadatos.truncado = true;

  const actor_tipo: ActorTipoAuditoria = evento.actor_tipo ?? (evento.actor_id ? 'USUARIO' : 'SISTEMA');
  const registrado_en = new Date().toISOString();

  const fila = {
    actor_id: evento.actor_id ?? null,
    actor_tipo,
    actor_rol: evento.actor_rol ?? null,
    accion: evento.accion,
    entidad: evento.entidad,
    entidad_id: evento.entidad_id ?? null,
    resultado: evento.resultado ?? 'EXITO',
    datos_antes: antes.valor,
    datos_despues: despues.valor,
    metadatos: redactar(metadatos),
    request_id: evento.request_id ?? null,
    sesion_id: evento.sesion_id ?? null,
    ip_origen: evento.ip ?? null,
    user_agent: evento.user_agent ?? null,
    registrado_en,
  };
  // hash_evento: SHA-256 canonico del evento. La cadena (hash_previo) la
  // completa el job de integridad del modulo auditoria (ver auditoria.md).
  const hash_evento = createHash('sha256').update(canonico(fila)).digest('hex');

  const { data, error } = await supabaseAdmin
    .from('auditoria_evento')
    .insert({ ...fila, hash_evento })
    .select('id')
    .single();
  if (error || !data) {
    logger.error({ err: error, accion: evento.accion, entidad: evento.entidad }, 'Fallo al registrar auditoria');
    throw new Error(`No fue posible registrar la auditoria: ${error?.message ?? 'sin datos'}`);
  }
  return data.id as string;
}

/** Toma ip, user agent y request id de una peticion Express. */
export function contextoDesdeRequest(req: {
  ip?: string;
  headers: Record<string, unknown>;
  id?: unknown;
  user?: { id: string; rol: Rol };
}): Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'> {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    user_agent: typeof ua === 'string' ? ua.slice(0, 512) : null,
    request_id: typeof req.id === 'string' ? req.id : null,
    actor_id: req.user?.id ?? null,
    actor_rol: req.user?.rol ?? null,
    actor_tipo: req.user ? 'USUARIO' : 'ANONIMO',
  };
}
