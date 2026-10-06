import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DestinatarioSuprimidoDTO, EntregaCorreoDTO, MotivoSupresion, Paginado, ResultadoWebhookCorreoDTO, ResumenEntregabilidadDTO } from '@foest/shared';
import { AppError, auditar, logger, paginar, rangoSupabase, supabaseAdmin, type EventoAuditoria } from '../../shared';
import type { EntregasQuery, EventoWebhookCorreo, LevantarSupresionInput, WebhookCorreoInput } from './notificaciones.dto';
import { envNotificaciones } from './notificaciones.env';
import type { FilaDestinatarioSuprimido, FilaEntregaCorreo } from './notificaciones.types';
import { normalizarEmail } from './ports/resolver-destinatarios.port';

/**
 * Entregabilidad: registro de rebotes/quejas (webhook firmado con HMAC), supresion de
 * destinatarios y bandeja de entregas para el administrador.
 */

const COLS_ENTREGA = 'id, evento_outbox_id, destinatario_email, rol_destinatario, estado, id_mensaje_proveedor, codigo_rebote, detalle_rebote, enviado_en, actualizado_en, evento_outbox:evento_outbox_id (tipo)';
const COLS_SUPRIMIDO = 'email, motivo, detalle, desde, levantado_por, levantado_en';
const TOLERANCIA_FIRMA_SEG = 300;

type FilaEntregaConTipo = FilaEntregaCorreo & { evento_outbox: { tipo: string } | Array<{ tipo: string }> | null };

function tipoDe(ev: FilaEntregaConTipo['evento_outbox']): string | null {
  if (!ev) return null;
  return Array.isArray(ev) ? (ev[0]?.tipo ?? null) : ev.tipo;
}

function presentarEntrega(f: FilaEntregaConTipo): EntregaCorreoDTO {
  const { evento_outbox, ...resto } = f;
  return { ...resto, tipo: tipoDe(evento_outbox) };
}

function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* ------------------------------ Supresion -------------------------------- */

/** Conjunto (minusculas) de los correos dados que estan suprimidos actualmente. */
export async function emailsSuprimidos(emails: string[]): Promise<Set<string>> {
  const lista = emails.map((e) => e.toLowerCase());
  if (lista.length === 0) return new Set();
  const { data, error } = await supabaseAdmin.from('destinatario_suprimido').select('email').in('email', lista).is('levantado_en', null);
  if (error) {
    logger.warn({ err: error }, 'No fue posible consultar destinatarios suprimidos; se asume ninguno');
    return new Set();
  }
  return new Set(((data ?? []) as Array<{ email: string }>).map((d) => d.email.toLowerCase()));
}

/** Suprime un correo (rebote duro, queja o manual) y alerta a los administradores. */
export async function suprimirDestinatario(email: string, motivo: MotivoSupresion, detalle: string | null, usuarioAfectado: string | null): Promise<void> {
  const normalizado = normalizarEmail(email);
  if (!normalizado) return;
  const { error } = await supabaseAdmin
    .from('destinatario_suprimido')
    .upsert({ email: normalizado, motivo, detalle: detalle ? detalle.slice(0, 500) : null, desde: new Date().toISOString(), levantado_por: null, levantado_en: null }, { onConflict: 'email' });
  if (error) {
    logger.error({ err: error }, 'No fue posible registrar la supresion del destinatario');
    return;
  }
  // Import diferido para evitar ciclo de modulos con outbox.service.
  const { alertarAdministradores } = await import('./outbox.service');
  await alertarAdministradores(
    'Correo suprimido por rebote o queja',
    `Una direccion de correo${usuarioAfectado ? ' de un usuario' : ''} fue suprimida (${motivo === 'REBOTE_DURO' ? 'rebote duro' : motivo === 'QUEJA' ? 'queja' : 'manual'}). Los correos a esa direccion no se enviaran hasta que se levante la supresion en Entregas de correo.`,
    `SUPRESION:${normalizado}:${new Date().toISOString().slice(0, 10)}`,
  );
}

/* ------------------------------- Webhook --------------------------------- */

/** JSON canonico (claves ordenadas, sin espacios) para firmar sin depender del cuerpo crudo. */
export function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${jsonCanonico(obj[k])}`)
    .join(',')}}`;
}

export function firmarWebhook(secreto: string, timestamp: number, body: unknown): string {
  return createHmac('sha256', secreto).update(`${timestamp}.${jsonCanonico(body)}`).digest('hex');
}

/**
 * Cabecera `X-Foest-Firma: t=<unix segundos>,v1=<hmac sha256 hex>`; firma sobre `t.jsonCanonico(body)`.
 * Tolerancia de 5 minutos y comparacion en tiempo constante.
 */
export function verificarFirmaWebhook(cabecera: string | undefined, body: unknown, ahora = Date.now()): boolean {
  const secreto = envNotificaciones().MAIL_WEBHOOK_SECRET;
  if (!secreto || !cabecera) return false;
  const partes = Object.fromEntries(cabecera.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = Number(partes.t);
  const v1 = partes.v1;
  if (!Number.isFinite(t) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (Math.abs(Math.floor(ahora / 1000) - t) > TOLERANCIA_FIRMA_SEG) return false;
  const esperada = Buffer.from(firmarWebhook(secreto, t, body), 'hex');
  const recibida = Buffer.from(v1, 'hex');
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

async function aplicarEventoWebhook(ev: EventoWebhookCorreo): Promise<boolean> {
  const email = normalizarEmail(ev.email ?? null);
  let q = supabaseAdmin.from('entrega_correo').select('id, destinatario_email, evento_outbox_id, estado');
  if (ev.id_mensaje_proveedor) q = q.eq('id_mensaje_proveedor', ev.id_mensaje_proveedor);
  else if (email) q = q.ilike('destinatario_email', escaparLike(email)).eq('estado', 'ENVIADO');
  else return false;
  const { data, error } = await q.order('enviado_en', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    logger.warn({ err: error }, 'No fue posible localizar la entrega del evento de webhook');
    return false;
  }
  const entrega = data as { id: string; destinatario_email: string; evento_outbox_id: string; estado: string } | null;
  const correo = email ?? normalizarEmail(entrega?.destinatario_email ?? null);

  if (entrega) {
    const nuevoEstado = ev.tipo === 'ENTREGADO' ? 'ENTREGADO' : ev.tipo === 'REBOTE' ? 'REBOTADO' : ev.tipo === 'QUEJA' ? 'QUEJA' : 'FALLIDO';
    const { error: errUpd } = await supabaseAdmin
      .from('entrega_correo')
      .update({ estado: nuevoEstado, codigo_rebote: ev.tipo === 'REBOTE' ? (ev.codigo_rebote ?? 'SOFT') : null, detalle_rebote: ev.detalle ? ev.detalle.slice(0, 1000) : null })
      .eq('id', entrega.id);
    if (errUpd) logger.warn({ err: errUpd }, 'No fue posible actualizar la entrega desde el webhook');
  }

  if (correo && ((ev.tipo === 'REBOTE' && (ev.codigo_rebote ?? 'SOFT') === 'HARD') || ev.tipo === 'QUEJA')) {
    let usuarioAfectado: string | null = null;
    if (entrega) {
      const { data: evOut } = await supabaseAdmin.from('evento_outbox').select('usuario_id').eq('id', entrega.evento_outbox_id).maybeSingle();
      usuarioAfectado = (evOut as { usuario_id: string | null } | null)?.usuario_id ?? null;
    }
    await suprimirDestinatario(correo, ev.tipo === 'QUEJA' ? 'QUEJA' : 'REBOTE_DURO', ev.detalle ?? null, usuarioAfectado);
  }
  return Boolean(entrega) || Boolean(correo);
}

/* ------------------------------- Servicio -------------------------------- */

export const entregabilidadService = {
  async listarEntregas(query: EntregasQuery): Promise<Paginado<EntregaCorreoDTO>> {
    const { desde, hasta } = rangoSupabase(query);
    let q = supabaseAdmin.from('entrega_correo').select(COLS_ENTREGA, { count: 'exact' });
    if (query.estado) q = q.eq('estado', query.estado);
    if (query.email) q = q.ilike('destinatario_email', `%${escaparLike(query.email.toLowerCase())}%`);
    const { data, error, count } = await q.order('enviado_en', { ascending: false }).range(desde, hasta);
    if (error) throw AppError.interno(`No fue posible consultar las entregas de correo: ${error.message}`);
    return paginar(((data ?? []) as unknown as FilaEntregaConTipo[]).map(presentarEntrega), query, count ?? 0);
  },

  async resumen(): Promise<ResumenEntregabilidadDTO> {
    const { conteosOutbox } = await import('./outbox.service');
    const hace24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const contar = async (estado?: string, desde?: string) => {
      let q = supabaseAdmin.from('entrega_correo').select('id', { count: 'exact', head: true });
      if (estado) q = q.eq('estado', estado);
      if (desde) q = q.gte('enviado_en', desde);
      const { count, error } = await q;
      if (error) throw AppError.interno(`No fue posible consultar la entregabilidad: ${error.message}`);
      return count ?? 0;
    };
    const listarSuprimidos = async () =>
      supabaseAdmin.from('destinatario_suprimido').select(COLS_SUPRIMIDO).is('levantado_en', null).order('desde', { ascending: false }).limit(100);
    // Todas las consultas se construyen dentro de funciones async para que un fallo
    // (p. ej. sin credenciales) se convierta en rechazo y no en una excepcion sincrona.
    const [enviadas, entregadas, rebotadas24, quejas24, fallidas, rebotadas, quejas, outbox, suprimidosRes] = await Promise.all([
      contar(undefined, hace24h),
      contar('ENTREGADO', hace24h),
      contar('REBOTADO', hace24h),
      contar('QUEJA', hace24h),
      contar('FALLIDO', hace24h),
      contar('REBOTADO'),
      contar('QUEJA'),
      conteosOutbox(),
      listarSuprimidos(),
    ]);
    if (suprimidosRes.error) throw AppError.interno(`No fue posible consultar los destinatarios suprimidos: ${suprimidosRes.error.message}`);
    const suprimidos = ((suprimidosRes.data ?? []) as FilaDestinatarioSuprimido[]).map<DestinatarioSuprimidoDTO>(({ detalle: _detalle, ...s }) => s);
    return {
      generado_en: new Date().toISOString(),
      ultimas_24h: { enviadas, entregadas, rebotadas: rebotadas24, quejas: quejas24, fallidas },
      totales: { rebotadas, quejas, suprimidos_activos: suprimidos.length },
      outbox,
      suprimidos,
    };
  },

  /** Levanta la supresion de un correo (auditado: LEVANTAR_SUPRESION / NOTIFICACION). */
  async levantarSupresion(input: LevantarSupresionInput, actorId: string, ctx: Partial<EventoAuditoria>): Promise<DestinatarioSuprimidoDTO> {
    const email = normalizarEmail(input.email);
    if (!email) throw AppError.datosInvalidos('EMAIL_INVALIDO', 'Correo invalido');
    const { data, error } = await supabaseAdmin.from('destinatario_suprimido').select(COLS_SUPRIMIDO).eq('email', email).is('levantado_en', null).maybeSingle();
    if (error) throw AppError.interno(`No fue posible consultar la supresion: ${error.message}`);
    const fila = data as FilaDestinatarioSuprimido | null;
    if (!fila) throw AppError.noEncontrado('SUPRESION_NO_ENCONTRADA', 'No existe una supresion vigente para ese correo');
    const levantado_en = new Date().toISOString();
    const { error: errUpd } = await supabaseAdmin.from('destinatario_suprimido').update({ levantado_en, levantado_por: actorId }).eq('email', email);
    if (errUpd) throw AppError.interno(`No fue posible levantar la supresion: ${errUpd.message}`);
    await auditar({
      ...ctx,
      accion: 'LEVANTAR_SUPRESION',
      entidad: 'NOTIFICACION',
      entidad_id: null,
      datos_antes: { motivo: fila.motivo, desde: fila.desde },
      datos_despues: { levantado_en },
      metadatos: { objeto: 'DESTINATARIO_SUPRIMIDO', motivo: input.motivo },
    });
    return { email, motivo: fila.motivo, desde: fila.desde, levantado_por: actorId, levantado_en };
  },

  /** Procesa los eventos del proveedor (ya verificada la firma). */
  async procesarWebhook(body: WebhookCorreoInput): Promise<ResultadoWebhookCorreoDTO> {
    const eventos = 'eventos' in body ? body.eventos : [body];
    let procesados = 0;
    for (const ev of eventos) {
      try {
        if (await aplicarEventoWebhook(ev)) procesados += 1;
      } catch (e) {
        logger.warn({ err: e }, 'Fallo al aplicar un evento del webhook de correo');
      }
    }
    return { recibidos: eventos.length, procesados, ignorados: eventos.length - procesados };
  },
};
