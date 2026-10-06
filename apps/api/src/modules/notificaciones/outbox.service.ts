import { randomUUID } from 'node:crypto';
import type { ConteosOutbox, EstadoOutbox, EventoOutboxDTO, OutboxListadoDTO, TipoNotificacion } from '@foest/shared';
import { CATALOGO_TIPOS_NOTIFICACION, ESTADOS_OUTBOX, esTipoNotificacion, tipoCorreoDesactivable, tipoEnviaCorreo, tipoTieneBuzon } from '@foest/shared';
import { AppError, auditar, logger, paginar, rangoSupabase, supabaseAdmin, type EventoAuditoria } from '../../shared';
import type { OutboxQuery } from './notificaciones.dto';
import { envNotificaciones } from './notificaciones.env';
import { leerConfigInt } from './notificaciones.config';
import type { Destinatario, EncolarNotificacionInput, EncolarNotificacionResultado, FilaEventoOutbox, FilaPreferencia, PayloadOutbox } from './notificaciones.types';
import { ErrorEnvioCorreo, obtenerMailer } from './ports/mailer.port';
import { normalizarEmail, obtenerResolverDestinatarios } from './ports/resolver-destinatarios.port';
import { CLAVES_SENSIBLES_PAYLOAD, LAYOUT_VERSION, plantillaDe, renderizarCorreo } from './plantillas/catalogo';
import { ErrorPlantilla, RE_CLAVE_PROHIBIDA, renderizarTexto } from './plantillas/render';
import { emailsSuprimidos, suprimirDestinatario } from './entregabilidad.service';

/**
 * Outbox transaccional de correo (notificaciones.md):
 *  - `encolarNotificacion`: inserta `notificacion` (buzon) y, si procede, `evento_outbox` PENDIENTE.
 *    Nota: supabase-js no expone transacciones multi-sentencia; las notificaciones que deben ser
 *    atomicas con la operacion de negocio se insertan desde funciones SQL (p. ej. fn_transicionar_postulacion).
 *  - `procesarOutbox`: worker (node-cron cada minuto) con reintentos, backoff exponencial con jitter,
 *    MUERTO al agotar NOTIF_REINTENTOS_MAX y SUPRIMIDO para destinatarios con rebote duro/queja.
 */

const COLS_OUTBOX = 'id, notificacion_id, usuario_id, tipo, plantilla_version, payload, estado, intentos, proximo_intento_en, ultimo_error, clave_idempotencia, creado_en, tomado_en, procesado_en';
const CLAVE_EXTRAS = '_destinatarios_extra';
/** Backoff: 30 s, 2 min, 10 min, 30 min, 1 h, 3 h, 6 h, 12 h (con jitter +-20 %). */
const BACKOFF_SEG = [30, 120, 600, 1800, 3600, 10_800, 21_600, 43_200] as const;
const RE_EMAIL_EN_TEXTO = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g;

function codigoDe(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

export function sanitizarError(texto: string): string {
  return texto.replace(RE_EMAIL_EN_TEXTO, '[correo]').replace(/\s+/g, ' ').trim().slice(0, 500);
}

/** Elimina claves de actor y valores no primitivos del payload. */
function limpiarPayload(payload: PayloadOutbox | undefined): PayloadOutbox {
  const limpio: PayloadOutbox = {};
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (RE_CLAVE_PROHIBIDA.test(k)) {
      logger.warn({ clave: k }, 'Se descarto una variable de actor del payload de notificacion');
      continue;
    }
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') limpio[k] = v;
  }
  return limpio;
}

async function leerPreferencia(usuarioId: string): Promise<Pick<FilaPreferencia, 'correo_recordatorios' | 'correo_informativos'>> {
  const { data, error } = await supabaseAdmin.from('preferencia_notificacion').select('correo_recordatorios, correo_informativos').eq('usuario_id', usuarioId).maybeSingle();
  if (error) {
    logger.warn({ err: error, usuarioId }, 'No fue posible leer preferencias; se asume todo activo');
    return { correo_recordatorios: true, correo_informativos: true };
  }
  return (data as FilaPreferencia | null) ?? { correo_recordatorios: true, correo_informativos: true };
}

export function versionPlantilla(tipo: TipoNotificacion): number {
  return plantillaDe(tipo).version * 100 + LAYOUT_VERSION;
}

/**
 * Punto unico de creacion de notificaciones para todos los modulos.
 * Inserta en `notificacion` (si el tipo tiene buzon) y en `evento_outbox` (si envia correo y
 * la preferencia del usuario lo permite). Idempotente por `clave_dedup` / `clave_idempotencia`.
 */
export async function encolarNotificacion(input: EncolarNotificacionInput): Promise<EncolarNotificacionResultado> {
  if (!esTipoNotificacion(input.tipo)) throw AppError.datosInvalidos('TIPO_NOTIFICACION_INVALIDO', `Tipo de notificacion desconocido: ${String(input.tipo)}`);
  const def = CATALOGO_TIPOS_NOTIFICACION[input.tipo];
  const severidad = input.severidad ?? def.severidad;
  const titulo = input.titulo.trim();
  const mensaje = input.mensaje.trim();
  if (!titulo || !mensaje) throw AppError.datosInvalidos('NOTIFICACION_INCOMPLETA', 'La notificacion requiere titulo y mensaje');

  const canal = input.canal ?? 'AMBOS';
  let notificacion_id: string | null = null;
  if (canal === 'CORREO' && tipoTieneBuzon(input.tipo) && input.clave_dedup) {
    // El buzon ya existe (creado por SQL u otro modulo): se enlaza por clave_dedup sin duplicarlo.
    const { data: existente } = await supabaseAdmin.from('notificacion').select('id').eq('usuario_id', input.usuario_id).eq('clave_dedup', input.clave_dedup).maybeSingle();
    notificacion_id = (existente as { id: string } | null)?.id ?? null;
  } else if (canal !== 'CORREO' && tipoTieneBuzon(input.tipo)) {
    const { data, error } = await supabaseAdmin
      .from('notificacion')
      .insert({
        usuario_id: input.usuario_id,
        tipo: input.tipo,
        titulo,
        mensaje,
        entidad: input.entidad ?? null,
        entidad_id: input.entidad_id ?? null,
        url_destino: input.url_destino ?? null,
        severidad,
        clave_dedup: input.clave_dedup ?? null,
      })
      .select('id')
      .maybeSingle();
    if (error) {
      if (codigoDe(error) === '23505') {
        const { data: existente } = await supabaseAdmin.from('notificacion').select('id').eq('usuario_id', input.usuario_id).eq('clave_dedup', input.clave_dedup ?? '').maybeSingle();
        return { notificacion_id: (existente as { id: string } | null)?.id ?? null, evento_outbox_id: null, duplicada: true, correo_omitido: 'DUPLICADO' };
      }
      throw AppError.interno(`No fue posible crear la notificacion: ${error.message}`);
    }
    notificacion_id = (data as { id: string } | null)?.id ?? null;
  }

  const quiereCorreo = canal === 'APP' ? false : (input.correo ?? tipoEnviaCorreo(input.tipo));
  if (!quiereCorreo) {
    return { notificacion_id, evento_outbox_id: null, duplicada: false, correo_omitido: input.correo === false || canal === 'APP' ? 'DESACTIVADO' : 'TIPO_SIN_CORREO' };
  }
  if (tipoCorreoDesactivable(input.tipo)) {
    const pref = await leerPreferencia(input.usuario_id);
    const bloqueado = (def.categoria === 'RECORDATORIO' && !pref.correo_recordatorios) || (def.categoria === 'INFORMATIVO' && !pref.correo_informativos);
    if (bloqueado) return { notificacion_id, evento_outbox_id: null, duplicada: false, correo_omitido: 'PREFERENCIA' };
  }

  const clave_idempotencia = input.clave_idempotencia ?? `${input.tipo}:${input.usuario_id}:${input.clave_dedup ?? notificacion_id ?? randomUUID()}`;
  const payload: PayloadOutbox = {
    ...limpiarPayload(input.payload),
    titulo,
    mensaje,
    url_destino: input.url_destino ?? null,
    severidad,
  };
  const extras = (input.destinatarios_extra ?? []).map(normalizarEmail).filter((e): e is string => Boolean(e));
  if (extras.length > 0) payload[CLAVE_EXTRAS] = extras.join(',');

  const { data: ev, error: errEv } = await supabaseAdmin
    .from('evento_outbox')
    .insert({
      notificacion_id,
      usuario_id: input.usuario_id,
      tipo: input.tipo,
      plantilla_version: versionPlantilla(input.tipo),
      payload,
      estado: 'PENDIENTE',
      proximo_intento_en: new Date().toISOString(),
      clave_idempotencia,
    })
    .select('id')
    .maybeSingle();
  if (errEv) {
    if (codigoDe(errEv) === '23505') return { notificacion_id, evento_outbox_id: null, duplicada: false, correo_omitido: 'DUPLICADO' };
    // El buzon ya quedo; el correo no debe bloquear el negocio.
    logger.error({ err: errEv, tipo: input.tipo }, 'No fue posible encolar el correo (evento_outbox)');
    return { notificacion_id, evento_outbox_id: null, duplicada: false, correo_omitido: 'DESACTIVADO' };
  }
  return { notificacion_id, evento_outbox_id: (ev as { id: string } | null)?.id ?? null, duplicada: false, correo_omitido: null };
}

/** Aviso `SISTEMA` (solo buzon) a todos los administradores activos, deduplicado por clave. */
export async function alertarAdministradores(titulo: string, mensaje: string, claveDedup: string, urlDestino = '/admin/notificaciones/entregas'): Promise<number> {
  const { data, error } = await supabaseAdmin.from('usuario').select('id').eq('rol', 'ADMINISTRADOR').eq('activo', true);
  if (error) {
    logger.error({ err: error }, 'No fue posible listar administradores para la alerta SISTEMA');
    return 0;
  }
  let n = 0;
  for (const a of (data ?? []) as Array<{ id: string }>) {
    try {
      const r = await encolarNotificacion({ usuario_id: a.id, tipo: 'SISTEMA', titulo, mensaje, url_destino: urlDestino, severidad: 'ADVERTENCIA', clave_dedup: `${claveDedup}:${a.id}`.slice(0, 200) });
      if (!r.duplicada) n += 1;
    } catch (e) {
      logger.error({ err: e }, 'No fue posible crear la alerta SISTEMA');
    }
  }
  return n;
}

/* ------------------------------- Worker ---------------------------------- */

let enProceso = false;

export interface ResultadoProcesoOutbox {
  tomados: number;
  enviados: number;
  fallidos: number;
  muertos: number;
  suprimidos: number;
}

async function tomarLote(limite: number): Promise<FilaEventoOutbox[]> {
  const { data, error } = await supabaseAdmin.rpc('fn_outbox_tomar_lote', { p_limite: limite });
  if (!error) return (data ?? []) as FilaEventoOutbox[];
  // Sin la funcion (migracion 0012 pendiente de aplicar): toma optimista fila a fila.
  logger.warn({ err: error }, 'fn_outbox_tomar_lote no disponible; se usa toma optimista');
  const ahora = new Date().toISOString();
  const { data: pendientes, error: errSel } = await supabaseAdmin
    .from('evento_outbox')
    .select(COLS_OUTBOX)
    .eq('estado', 'PENDIENTE')
    .lte('proximo_intento_en', ahora)
    .order('proximo_intento_en', { ascending: true })
    .limit(limite);
  if (errSel) {
    logger.error({ err: errSel }, 'No fue posible leer el outbox');
    return [];
  }
  const tomados: FilaEventoOutbox[] = [];
  for (const ev of (pendientes ?? []) as FilaEventoOutbox[]) {
    const { data: upd } = await supabaseAdmin.from('evento_outbox').update({ estado: 'EN_PROCESO', tomado_en: ahora }).eq('id', ev.id).eq('estado', 'PENDIENTE').select(COLS_OUTBOX).maybeSingle();
    if (upd) tomados.push(upd as FilaEventoOutbox);
  }
  return tomados;
}

function backoffConJitter(intento: number): Date {
  const base = BACKOFF_SEG[Math.min(Math.max(intento - 1, 0), BACKOFF_SEG.length - 1)] ?? 30;
  const jitter = 1 + (Math.random() * 0.4 - 0.2);
  return new Date(Date.now() + Math.round(base * jitter * 1000));
}

function payloadCompactado(tipo: TipoNotificacion, payload: PayloadOutbox): PayloadOutbox {
  if (CATALOGO_TIPOS_NOTIFICACION[tipo].categoria === 'SEGURIDAD') return { titulo: payload.titulo ?? null, compactado: true };
  const copia: PayloadOutbox = { ...payload, compactado: true };
  for (const k of CLAVES_SENSIBLES_PAYLOAD) delete copia[k];
  delete copia[CLAVE_EXTRAS];
  return copia;
}

async function actualizarEvento(id: string, cambios: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from('evento_outbox').update(cambios).eq('id', id);
  if (error) logger.error({ err: error, evento: id }, 'No fue posible actualizar el evento del outbox');
}

async function marcarMuerto(ev: FilaEventoOutbox, motivo: string): Promise<void> {
  const error = sanitizarError(motivo);
  await actualizarEvento(ev.id, { estado: 'MUERTO', ultimo_error: error, procesado_en: new Date().toISOString() });
  await alertarAdministradores(
    'Correo no entregado (outbox MUERTO)',
    `El correo de tipo ${ev.tipo} no pudo enviarse: ${error}. Puede reintentarlo desde Entregas de correo.`,
    `OUTBOX_MUERTO:${ev.id}`,
  );
}

async function registrarEntrega(evento: FilaEventoOutbox, d: Destinatario, estado: 'ENVIADO' | 'FALLIDO', idProveedor: string | null, err: ErrorEnvioCorreo | null): Promise<void> {
  const { error } = await supabaseAdmin.from('entrega_correo').insert({
    evento_outbox_id: evento.id,
    destinatario_email: d.email,
    rol_destinatario: d.rol,
    estado,
    id_mensaje_proveedor: idProveedor,
    codigo_rebote: err?.reboteDuro ? 'HARD' : null,
    detalle_rebote: err ? sanitizarError(err.message) : null,
  });
  if (error) logger.error({ err: error, evento: evento.id }, 'No fue posible registrar la entrega de correo');
}

async function procesarEvento(ev: FilaEventoOutbox, maxReintentos: number): Promise<keyof ResultadoProcesoOutbox> {
  if (!esTipoNotificacion(ev.tipo)) {
    await marcarMuerto(ev, `Tipo de notificacion desconocido: ${ev.tipo}`);
    return 'muertos';
  }
  const tipo = ev.tipo;
  const payload = (ev.payload ?? {}) as PayloadOutbox;

  let destinatarios: Destinatario[] = [];
  try {
    destinatarios = ev.usuario_id ? await obtenerResolverDestinatarios().resolver(ev.usuario_id, tipo) : [];
  } catch (e) {
    const intentos = ev.intentos + 1;
    if (intentos >= maxReintentos) {
      await marcarMuerto(ev, `No fue posible resolver destinatarios: ${(e as Error).message}`);
      return 'muertos';
    }
    await actualizarEvento(ev.id, { estado: 'FALLIDO', intentos, proximo_intento_en: backoffConJitter(intentos).toISOString(), ultimo_error: sanitizarError((e as Error).message) });
    return 'fallidos';
  }
  const extras = typeof payload[CLAVE_EXTRAS] === 'string' ? String(payload[CLAVE_EXTRAS]).split(',') : [];
  for (const e of extras) {
    const email = normalizarEmail(e);
    if (email && !destinatarios.some((d) => d.email === email)) destinatarios.push({ email, rol: 'ALTERNATIVO' });
  }
  if (destinatarios.length === 0) {
    await marcarMuerto(ev, 'El usuario no tiene correos de destino');
    return 'muertos';
  }

  const suprimidos = await emailsSuprimidos(destinatarios.map((d) => d.email));
  const activos = destinatarios.filter((d) => !suprimidos.has(d.email));
  if (activos.length === 0) {
    await actualizarEvento(ev.id, { estado: 'SUPRIMIDO', procesado_en: new Date().toISOString(), ultimo_error: 'Todos los destinatarios estan suprimidos' });
    await alertarAdministradores(
      'Correo omitido por destinatario suprimido',
      `El correo de tipo ${ev.tipo} no se envio porque todos los correos del usuario estan suprimidos por rebote o queja. Verifique la direccion del usuario afectado.`,
      `OUTBOX_SUPRIMIDO:${ev.usuario_id ?? ev.id}`,
    );
    return 'suprimidos';
  }

  let correo;
  try {
    correo = renderizarCorreo(tipo, payload, envNotificaciones().WEB_ORIGIN);
  } catch (e) {
    if (e instanceof ErrorPlantilla) {
      await marcarMuerto(ev, `Error de plantilla: ${e.message}`);
      return 'muertos';
    }
    throw e;
  }

  const mailer = obtenerMailer();
  let exitos = 0;
  let permanentes = 0;
  let ultimoError: ErrorEnvioCorreo | null = null;
  for (const d of activos) {
    try {
      const r = await mailer.enviar({ para: d.email, asunto: correo.asunto, html: correo.html, texto: correo.texto, cabeceras: { 'X-FOEST-Evento': ev.id, 'X-FOEST-Tipo': tipo } });
      await registrarEntrega(ev, d, 'ENVIADO', r.id_mensaje_proveedor, null);
      exitos += 1;
    } catch (e) {
      const err = e instanceof ErrorEnvioCorreo ? e : new ErrorEnvioCorreo(String((e as Error)?.message ?? e));
      ultimoError = err;
      await registrarEntrega(ev, d, 'FALLIDO', null, err);
      if (err.reboteDuro) await suprimirDestinatario(d.email, 'REBOTE_DURO', err.message, ev.usuario_id);
      if (err.permanente) permanentes += 1;
      logger.warn({ evento: ev.id, rol: d.rol, permanente: err.permanente }, 'Fallo el envio a un destinatario');
    }
  }

  if (exitos > 0) {
    await actualizarEvento(ev.id, {
      estado: 'ENVIADO',
      procesado_en: new Date().toISOString(),
      ultimo_error: ultimoError ? sanitizarError(`Entrega parcial: ${ultimoError.message}`) : null,
      payload: payloadCompactado(tipo, payload),
    });
    return 'enviados';
  }
  if (permanentes === activos.length) {
    await marcarMuerto(ev, `Error permanente del proveedor: ${ultimoError?.message ?? 'desconocido'}`);
    return 'muertos';
  }
  const intentos = ev.intentos + 1;
  if (intentos >= maxReintentos) {
    await marcarMuerto(ev, `Reintentos agotados (${intentos}): ${ultimoError?.message ?? 'desconocido'}`);
    return 'muertos';
  }
  await actualizarEvento(ev.id, { estado: 'FALLIDO', intentos, proximo_intento_en: backoffConJitter(intentos).toISOString(), ultimo_error: sanitizarError(ultimoError?.message ?? 'Fallo de envio') });
  return 'fallidos';
}

/**
 * Procesa un lote del outbox. Reentrante-seguro dentro del proceso; entre procesos
 * se apoya en `fn_outbox_tomar_lote` (FOR UPDATE SKIP LOCKED).
 */
export async function procesarOutbox(limite = 20): Promise<ResultadoProcesoOutbox> {
  const resultado: ResultadoProcesoOutbox = { tomados: 0, enviados: 0, fallidos: 0, muertos: 0, suprimidos: 0 };
  if (enProceso) return resultado;
  enProceso = true;
  try {
    const lote = await tomarLote(limite);
    resultado.tomados = lote.length;
    if (lote.length === 0) return resultado;
    const max = await leerConfigInt('NOTIF_REINTENTOS_MAX', 8);
    for (const ev of lote) {
      try {
        const r = await procesarEvento(ev, max);
        resultado[r] += 1;
      } catch (e) {
        logger.error({ err: e, evento: ev.id }, 'Fallo inesperado procesando un evento del outbox');
        await actualizarEvento(ev.id, { estado: 'FALLIDO', intentos: ev.intentos + 1, proximo_intento_en: backoffConJitter(ev.intentos + 1).toISOString(), ultimo_error: sanitizarError((e as Error).message ?? 'Error inesperado') });
        resultado.fallidos += 1;
      }
    }
    return resultado;
  } finally {
    enProceso = false;
  }
}

/** Devuelve a PENDIENTE los eventos EN_PROCESO por mas de `minutos` (worker caido). */
export async function recuperarAtascados(minutos = 10): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('fn_outbox_recuperar_atascados', { p_minutos: minutos });
  if (!error) return Number(data ?? 0);
  const limite = new Date(Date.now() - minutos * 60_000).toISOString();
  const { data: filas, error: errUpd } = await supabaseAdmin.from('evento_outbox').update({ estado: 'PENDIENTE', tomado_en: null }).eq('estado', 'EN_PROCESO').lt('tomado_en', limite).select('id');
  if (errUpd) {
    logger.error({ err: errUpd }, 'No fue posible recuperar eventos atascados del outbox');
    return 0;
  }
  return (filas ?? []).length;
}

/* ------------------------------ Administracion ---------------------------- */

function presentarEvento(ev: FilaEventoOutbox): EventoOutboxDTO {
  let asunto: string | null = null;
  if (esTipoNotificacion(ev.tipo)) {
    try {
      asunto = renderizarTexto(plantillaDe(ev.tipo).asunto, (ev.payload ?? {}) as PayloadOutbox, false).replace(/\s+/g, ' ').trim() || null;
    } catch {
      asunto = null;
    }
  }
  return {
    id: ev.id,
    notificacion_id: ev.notificacion_id,
    usuario_id: ev.usuario_id,
    tipo: ev.tipo,
    plantilla_version: ev.plantilla_version,
    estado: ev.estado,
    intentos: ev.intentos,
    proximo_intento_en: ev.proximo_intento_en,
    ultimo_error: ev.ultimo_error,
    clave_idempotencia: ev.clave_idempotencia,
    creado_en: ev.creado_en,
    tomado_en: ev.tomado_en,
    procesado_en: ev.procesado_en,
    asunto,
  };
}

export async function conteosOutbox(): Promise<ConteosOutbox & { edad_pendiente_mas_antiguo_seg: number }> {
  const conteos = Object.fromEntries(ESTADOS_OUTBOX.map((e) => [e, 0])) as ConteosOutbox;
  await Promise.all(
    ESTADOS_OUTBOX.map(async (estado: EstadoOutbox) => {
      const { count, error } = await supabaseAdmin.from('evento_outbox').select('id', { count: 'exact', head: true }).eq('estado', estado);
      if (error) throw AppError.interno(`No fue posible contar el outbox: ${error.message}`);
      conteos[estado] = count ?? 0;
    }),
  );
  let edad = 0;
  const { data } = await supabaseAdmin.from('evento_outbox').select('creado_en').eq('estado', 'PENDIENTE').order('creado_en', { ascending: true }).limit(1).maybeSingle();
  const masAntiguo = (data as { creado_en: string } | null)?.creado_en;
  if (masAntiguo) edad = Math.max(0, Math.round((Date.now() - new Date(masAntiguo).getTime()) / 1000));
  return { ...conteos, edad_pendiente_mas_antiguo_seg: edad };
}

export const outboxService = {
  async listar(query: OutboxQuery): Promise<OutboxListadoDTO> {
    const { desde, hasta } = rangoSupabase(query);
    let q = supabaseAdmin.from('evento_outbox').select(COLS_OUTBOX, { count: 'exact' });
    if (query.estado) q = q.eq('estado', query.estado);
    if (query.tipo) q = q.eq('tipo', query.tipo);
    const [{ data, error, count }, conteos] = await Promise.all([q.order('creado_en', { ascending: false }).range(desde, hasta), conteosOutbox()]);
    if (error) throw AppError.interno(`No fue posible consultar el outbox: ${error.message}`);
    const { edad_pendiente_mas_antiguo_seg, ...resto } = conteos;
    return { ...paginar(((data ?? []) as FilaEventoOutbox[]).map(presentarEvento), query, count ?? 0), conteos: resto, edad_pendiente_mas_antiguo_seg };
  },

  async obtener(id: string): Promise<EventoOutboxDTO> {
    const { data, error } = await supabaseAdmin.from('evento_outbox').select(COLS_OUTBOX).eq('id', id).maybeSingle();
    if (error) throw AppError.interno(`No fue posible consultar el evento: ${error.message}`);
    if (!data) throw AppError.noEncontrado();
    return presentarEvento(data as FilaEventoOutbox);
  },

  /** Reencola un evento FALLIDO, MUERTO o SUPRIMIDO (auditado: REINTENTAR / NOTIFICACION). */
  async reintentar(id: string, ctx: Partial<EventoAuditoria>): Promise<EventoOutboxDTO> {
    const { data, error } = await supabaseAdmin.from('evento_outbox').select(COLS_OUTBOX).eq('id', id).maybeSingle();
    if (error) throw AppError.interno(`No fue posible consultar el evento: ${error.message}`);
    const ev = data as FilaEventoOutbox | null;
    if (!ev) throw AppError.noEncontrado();
    if (!['FALLIDO', 'MUERTO', 'SUPRIMIDO'].includes(ev.estado)) {
      throw AppError.conflicto('ESTADO_NO_REINTENTABLE', `Solo se reintentan eventos FALLIDO, MUERTO o SUPRIMIDO (estado actual: ${ev.estado})`);
    }
    const { data: upd, error: errUpd } = await supabaseAdmin
      .from('evento_outbox')
      .update({ estado: 'PENDIENTE', intentos: 0, proximo_intento_en: new Date().toISOString(), ultimo_error: null, tomado_en: null, procesado_en: null })
      .eq('id', id)
      .select(COLS_OUTBOX)
      .maybeSingle();
    if (errUpd) throw AppError.interno(`No fue posible reencolar el evento: ${errUpd.message}`);
    await auditar({
      ...ctx,
      accion: 'REINTENTAR',
      entidad: 'NOTIFICACION',
      entidad_id: id,
      datos_antes: { estado: ev.estado, intentos: ev.intentos, ultimo_error: ev.ultimo_error },
      datos_despues: { estado: 'PENDIENTE', intentos: 0 },
      metadatos: { objeto: 'EVENTO_OUTBOX', tipo: ev.tipo },
    });
    return presentarEvento((upd as FilaEventoOutbox | null) ?? { ...ev, estado: 'PENDIENTE', intentos: 0, ultimo_error: null });
  },
};
