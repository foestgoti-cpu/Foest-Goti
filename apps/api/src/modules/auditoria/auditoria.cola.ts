import { auditar, logger, redactar, supabaseAdmin, type EventoAuditoria } from '../../shared';
import type { AuditoriaPendienteRow, EventoPendiente } from './auditoria.types';

/**
 * Canal para eventos FUERA de una transaccion de negocio (auditoria.md):
 * login fallido, acceso denegado, refresh invalido, rate limit.
 *
 * Sin Redis/BullMQ (DECISIONES section 19) la cola es la tabla
 * `auditoria_evento_pendiente`: `auditarFueraDeTx` intenta la insercion directa y,
 * si falla, persiste el evento en la cola; `procesarPendientes` (job cada minuto)
 * lo inserta con reintentos y backoff exponencial conservando el `registrado_en`
 * original. La cadena de hashes la completa el trigger SQL en el orden real de
 * insercion (secuencia), no por `registrado_en`.
 */
export const MAX_INTENTOS_PENDIENTE = 8;
const LIMITE_JSON_BYTES = 64 * 1024;

export type ResultadoFueraDeTx = { modo: 'DIRECTO'; evento_id: string } | { modo: 'ENCOLADO'; pendiente_id: string };

export async function auditarFueraDeTx(evento: EventoAuditoria): Promise<ResultadoFueraDeTx> {
  const registrado_en = new Date().toISOString();
  try {
    const evento_id = await auditar(evento);
    return { modo: 'DIRECTO', evento_id };
  } catch (errorDirecto) {
    const pendiente: EventoPendiente = { ...evento, registrado_en };
    const { data, error } = await supabaseAdmin.from('auditoria_evento_pendiente').insert({ evento: pendiente }).select('id').single();
    if (error || !data) {
      logger.error({ err: error, errorDirecto, accion: evento.accion }, 'No fue posible encolar el evento de auditoria');
      throw errorDirecto;
    }
    logger.warn({ pendiente_id: data.id, accion: evento.accion }, 'Evento de auditoria encolado (insercion directa fallida)');
    return { modo: 'ENCOLADO', pendiente_id: data.id as string };
  }
}

function limitar(valor: unknown): { valor: unknown; truncado: boolean } {
  if (valor === undefined || valor === null) return { valor: null, truncado: false };
  const texto = JSON.stringify(valor);
  if (Buffer.byteLength(texto, 'utf8') <= LIMITE_JSON_BYTES) return { valor, truncado: false };
  if (typeof valor === 'object' && !Array.isArray(valor)) return { valor: { claves: Object.keys(valor as object) }, truncado: true };
  return { valor: { truncado: true }, truncado: true };
}

/** Construye la fila de `auditoria_evento` con la misma redaccion que `auditar()` y el instante original. */
export function construirFilaPendiente(p: EventoPendiente, pendienteId: string): Record<string, unknown> {
  const antes = limitar(redactar(p.datos_antes));
  const despues = limitar(redactar(p.datos_despues));
  const metadatos: Record<string, unknown> = { ...(p.metadatos ?? {}), encolado: true, pendiente_id: pendienteId };
  if (antes.truncado || despues.truncado) metadatos.truncado = true;
  return {
    actor_id: p.actor_id ?? null,
    actor_tipo: p.actor_tipo ?? (p.actor_id ? 'USUARIO' : 'SISTEMA'),
    actor_rol: p.actor_rol ?? null,
    accion: p.accion,
    entidad: p.entidad,
    entidad_id: p.entidad_id ?? null,
    resultado: p.resultado ?? 'EXITO',
    datos_antes: antes.valor,
    datos_despues: despues.valor,
    metadatos: redactar(metadatos),
    request_id: p.request_id ?? null,
    sesion_id: p.sesion_id ?? null,
    ip_origen: p.ip ?? null,
    user_agent: p.user_agent ?? null,
    registrado_en: p.registrado_en,
  };
}

/** Backoff exponencial en minutos: 1, 2, 4, ... con tope de 6 horas. */
export function proximoIntento(intentos: number, ahora = new Date()): string {
  const minutos = Math.min(2 ** Math.max(0, intentos - 1), 360);
  return new Date(ahora.getTime() + minutos * 60_000).toISOString();
}

export async function procesarPendientes(limite = 100): Promise<{ procesados: number; fallidos: number }> {
  const ahora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('auditoria_evento_pendiente')
    .select('*')
    .eq('estado', 'ENCOLADO')
    .lte('proximo_intento_en', ahora)
    .order('creado_en', { ascending: true })
    .limit(limite);
  if (error) {
    logger.error({ err: error }, 'No fue posible leer la cola de auditoria');
    return { procesados: 0, fallidos: 0 };
  }
  let procesados = 0;
  let fallidos = 0;
  for (const fila of (data ?? []) as AuditoriaPendienteRow[]) {
    const { data: ins, error: errIns } = await supabaseAdmin
      .from('auditoria_evento')
      .insert(construirFilaPendiente(fila.evento, fila.id))
      .select('id')
      .single();
    if (!errIns && ins) {
      await supabaseAdmin
        .from('auditoria_evento_pendiente')
        .update({ estado: 'PROCESADO', procesado_en: new Date().toISOString(), evento_id: ins.id as string })
        .eq('id', fila.id);
      procesados += 1;
      continue;
    }
    const intentos = fila.intentos + 1;
    const agotado = intentos >= MAX_INTENTOS_PENDIENTE;
    await supabaseAdmin
      .from('auditoria_evento_pendiente')
      .update({
        intentos,
        ultimo_error: (errIns?.message ?? 'sin datos').slice(0, 1000),
        proximo_intento_en: proximoIntento(intentos),
        estado: agotado ? 'FALLIDO' : 'ENCOLADO',
      })
      .eq('id', fila.id);
    fallidos += 1;
    logger.warn({ pendiente_id: fila.id, intentos, agotado, err: errIns }, 'Reintento de evento de auditoria encolado');
  }
  return { procesados, fallidos };
}
