import crypto from 'node:crypto';
import {
  EstadoFormato,
  EstadoVigenciaFormato,
  TIPOS_FORMATO,
  type DescargaFormatoDto,
  type FormatoGeneradoDto,
  type ListadoFormatosDto,
  type TipoFormato,
} from '@foest/shared';
import { AppError, auditar, logger, supabaseAdmin, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { configuracionService } from '../catalogos_configuracion';
import { calcularHashContenido, cargarContexto, construirDatos, admiteGeneracion, validarGeneracion } from './datos-formato.service';
import { hashContenidoService, sha256Hex } from './hash-contenido';
import { BUCKET_FORMATOS, SEGUNDOS_URL_DESCARGA, VERSION_PLANTILLA, type ContextoFormato, type FormatoRow } from './formato.types';
import { esDuenoDelExpediente, puedeLeerExpediente, type ExpedienteMinimo } from './ports/expediente-acceso.port';
import { renderService } from './render.service';
import { esTablaInexistente } from './vigencia.service';

/**
 * Orquestacion de la generacion de GE-F041 / GE-F043: validaciones previas, hash_contenido,
 * invalidacion de vigentes (atomica en SQL), render, almacenamiento, URL de descarga y auditoria.
 * Docs: docs/modules/formatos_oficiales.md.
 */

export type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

const TIMEOUT_SINCRONO_DEFECTO_MS = 10_000;
const MAX_POR_POSTULACION_TIPO = 5;
const VENTANA_POSTULACION_TIPO_MS = 10 * 60 * 1000;
const MAX_POR_USUARIO = 20;
const VENTANA_USUARIO_MS = 60 * 60 * 1000;
const GENERANDO_OBSOLETO_MS = 5 * 60 * 1000;
const COLUMNAS_PUBLICAS = '*';

export function aDto(f: FormatoRow): FormatoGeneradoDto {
  return {
    id: f.id,
    tipo: f.tipo,
    postulacion_id: f.postulacion_id,
    generado_por: f.generado_por,
    estado: f.estado,
    version_plantilla: f.version_plantilla,
    hash_contenido: f.hash_contenido,
    codigo_verificacion: f.codigo_verificacion,
    tamano_bytes: f.tamano_bytes,
    vigente: f.vigente,
    generado_en: f.generado_en,
  };
}

export type ResultadoGeneracion = { http: 200 | 201 | 202; formato: FormatoGeneradoDto };

function generarCodigoVerificacion(): string {
  return crypto.randomBytes(16).toString('base64url'); // 128 bits, 22 caracteres
}

async function leerFormato(id: string): Promise<FormatoRow | null> {
  const { data, error } = await supabaseAdmin.from('formato_generado').select(COLUMNAS_PUBLICAS).eq('id', id).maybeSingle();
  if (error) throw AppError.interno(`No fue posible leer el formato: ${error.message}`);
  return (data as FormatoRow | null) ?? null;
}

async function expedienteDe(postulacionId: string): Promise<ExpedienteMinimo | null> {
  const { data, error } = await supabaseAdmin.from('postulacion').select('id, beneficiario_id, convocatoria_id').eq('id', postulacionId).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar la postulacion: ${error.message}`);
  return (data as ExpedienteMinimo | null) ?? null;
}

/** Postulacion visible para el usuario o 404 (ajena, sin alcance o inexistente). */
async function exigirAlcance(user: UsuarioAutenticado, postulacionId: string): Promise<ExpedienteMinimo> {
  const exp = await expedienteDe(postulacionId);
  if (!exp || !(await puedeLeerExpediente(user, exp))) throw AppError.noEncontrado();
  return exp;
}

async function ultimoVigente(postulacionId: string, tipo: TipoFormato): Promise<FormatoRow | null> {
  const { data, error } = await supabaseAdmin
    .from('formato_generado')
    .select(COLUMNAS_PUBLICAS)
    .eq('postulacion_id', postulacionId)
    .eq('tipo', tipo)
    .eq('vigente', true)
    .eq('estado', 'LISTO')
    .maybeSingle();
  if (error) {
    if (esTablaInexistente(error)) throw AppError.interno('El modulo de formatos no esta disponible: falta aplicar la migracion 0015');
    throw AppError.interno(`No fue posible leer los formatos: ${error.message}`);
  }
  return (data as FormatoRow | null) ?? null;
}

async function verificarLimites(postulacionId: string, tipo: TipoFormato, usuarioId: string): Promise<void> {
  const desdePost = new Date(Date.now() - VENTANA_POSTULACION_TIPO_MS).toISOString();
  const desdeUsuario = new Date(Date.now() - VENTANA_USUARIO_MS).toISOString();
  const [porPost, porUsuario] = await Promise.all([
    supabaseAdmin
      .from('formato_generado')
      .select('id', { head: true, count: 'exact' })
      .eq('postulacion_id', postulacionId)
      .eq('tipo', tipo)
      .gte('generado_en', desdePost),
    supabaseAdmin.from('formato_generado').select('id', { head: true, count: 'exact' }).eq('generado_por', usuarioId).gte('generado_en', desdeUsuario),
  ]);
  if ((porPost.count ?? 0) >= MAX_POR_POSTULACION_TIPO) {
    throw new AppError(429, 'RATE_LIMIT', 'Alcanzó el límite de generaciones de este formato; intente de nuevo en unos minutos');
  }
  if ((porUsuario.count ?? 0) >= MAX_POR_USUARIO) {
    throw new AppError(429, 'RATE_LIMIT', 'Alcanzó el límite de generaciones por hora; intente de nuevo más tarde');
  }
}

async function crearRegistroGenerando(ctx: ContextoFormato, tipo: TipoFormato, usuarioId: string, hash: string): Promise<FormatoRow> {
  // Una generacion interrumpida (reinicio del servidor) no debe bloquear para siempre.
  await supabaseAdmin
    .from('formato_generado')
    .update({ estado: 'FALLIDO', detalle_error: 'Generacion interrumpida' })
    .eq('postulacion_id', ctx.postulacion.id)
    .eq('tipo', tipo)
    .eq('estado', 'GENERANDO')
    .lt('generado_en', new Date(Date.now() - GENERANDO_OBSOLETO_MS).toISOString());

  for (let intento = 0; intento < 3; intento += 1) {
    const { data, error } = await supabaseAdmin
      .from('formato_generado')
      .insert({
        tipo,
        postulacion_id: ctx.postulacion.id,
        generado_por: usuarioId,
        estado: 'GENERANDO',
        version_plantilla: VERSION_PLANTILLA[tipo],
        hash_contenido: hash,
        codigo_verificacion: generarCodigoVerificacion(),
        vigente: false,
      })
      .select(COLUMNAS_PUBLICAS)
      .single();
    if (!error) return data as FormatoRow;
    if (error.code === '23505' && /uq_formato_generando/.test(error.message + (error.details ?? ''))) {
      throw AppError.conflicto('GENERACION_EN_CURSO', 'Ya hay una generación de este formato en curso; espere a que termine');
    }
    if (error.code === '23505' && /codigo_verificacion/.test(error.message + (error.details ?? ''))) continue;
    if (esTablaInexistente(error)) throw AppError.interno('El modulo de formatos no esta disponible: falta aplicar la migracion 0015');
    throw AppError.interno(`No fue posible registrar el formato: ${error.message}`);
  }
  throw AppError.interno('No fue posible generar un código de verificación único');
}

async function marcarFallido(id: string, motivo: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('formato_generado')
    .update({ estado: 'FALLIDO', detalle_error: motivo.slice(0, 500) })
    .eq('id', id)
    .eq('estado', 'GENERANDO');
  if (error) logger.error({ err: error, formato_id: id }, 'No se pudo marcar el formato como FALLIDO');
}

/** Render + almacenamiento + paso a LISTO (atomico en SQL) + auditoria. Si falla deja FALLIDO. */
async function ejecutarGeneracion(
  registro: FormatoRow,
  ctx: ContextoFormato,
  tipo: TipoFormato,
  contextoAud: ContextoAuditoria,
  timeoutRenderMs: number,
): Promise<FormatoRow> {
  let listo: FormatoRow;
  let previoInvalidado: string | null = null;
  try {
    const datos = construirDatos(ctx, tipo);
    const pdf = await renderService.render(
      { tipo, vista: datos.vista, codigoVerificacion: registro.codigo_verificacion, generadoEn: new Date(registro.generado_en) },
      timeoutRenderMs,
    );
    // El SHA-256 se calcula sobre el PDF definitivo y solo se guarda en BD (nunca dentro del archivo).
    const sha256 = sha256Hex(pdf);
    const clave = `${registro.postulacion_id}/${registro.id}.pdf`;
    const subida = await supabaseAdmin.storage.from(BUCKET_FORMATOS).upload(clave, pdf, { contentType: 'application/pdf', upsert: false });
    if (subida.error) throw new Error(`Almacenamiento: ${subida.error.message}`);

    previoInvalidado = (await ultimoVigente(registro.postulacion_id, tipo))?.id ?? null;
    const { data, error } = await supabaseAdmin.rpc('fn_formato_marcar_listo', {
      p_formato_id: registro.id,
      p_sha256: sha256,
      p_storage_key: clave,
      p_tamano_bytes: pdf.length,
    });
    if (error) throw new Error(`Registro: ${error.message}`);
    listo = (Array.isArray(data) ? data[0] : data) as FormatoRow;
  } catch (e) {
    const motivo = e instanceof Error ? e.message : 'Error desconocido';
    logger.error({ err: e, formato_id: registro.id, tipo }, 'Fallo la generacion del formato');
    await marcarFallido(registro.id, motivo);
    await auditar({
      ...contextoAud,
      accion: 'GENERAR_FORMATO',
      entidad: 'FORMATO_GENERADO',
      entidad_id: registro.id,
      resultado: 'FALLO',
      metadatos: { tipo, postulacion_id: registro.postulacion_id },
    }).catch((err: unknown) => logger.error({ err }, 'No se pudo auditar el fallo de generacion'));
    throw AppError.interno('No fue posible generar el formato; intente de nuevo');
  }

  await auditar({
    ...contextoAud,
    accion: 'GENERAR_FORMATO',
    entidad: 'FORMATO_GENERADO',
    entidad_id: listo.id,
    datos_despues: { tipo, postulacion_id: listo.postulacion_id, hash_contenido: listo.hash_contenido, vigente: true },
    metadatos: { vigente_previo_invalidado: previoInvalidado, version_plantilla: listo.version_plantilla },
  });
  return listo;
}

export class FormatoService {
  async generar(user: UsuarioAutenticado, contextoAud: ContextoAuditoria, postulacionId: string, tipo: TipoFormato): Promise<ResultadoGeneracion> {
    // Solo el dueno puede generar: cualquier otra cosa es 404 (nunca 403).
    const exp = await expedienteDe(postulacionId);
    if (!exp || user.rol !== 'BENEFICIARIO' || !(await esDuenoDelExpediente(user.id, exp))) throw AppError.noEncontrado();

    const ctx = await cargarContexto(postulacionId);
    if (!ctx) throw AppError.noEncontrado();
    validarGeneracion(ctx, tipo);

    const hash = calcularHashContenido(ctx, tipo);
    const vigente = await ultimoVigente(postulacionId, tipo);
    if (vigente && vigente.hash_contenido === hash) return { http: 200, formato: aDto(vigente) };

    await verificarLimites(postulacionId, tipo, user.id);
    const registro = await crearRegistroGenerando(ctx, tipo, user.id, hash);

    const timeoutSincrono = await configuracionService.getEntero('FORMATOS_GENERACION_TIMEOUT_MS', TIMEOUT_SINCRONO_DEFECTO_MS);
    const trabajo = ejecutarGeneracion(registro, ctx, tipo, contextoAud, Math.max(timeoutSincrono * 6, 60_000));

    let temporizador: NodeJS.Timeout | undefined;
    const espera = new Promise<'TIMEOUT'>((resolve) => {
      temporizador = setTimeout(() => resolve('TIMEOUT'), timeoutSincrono);
    });
    try {
      const resultado = await Promise.race([trabajo, espera]);
      if (resultado === 'TIMEOUT') {
        // La generacion continua en segundo plano; el cliente sondea GET /formatos/:id.
        trabajo.catch(() => undefined);
        return { http: 202, formato: aDto(registro) };
      }
      return { http: 201, formato: aDto(resultado) };
    } finally {
      if (temporizador) clearTimeout(temporizador);
    }
  }

  async listar(user: UsuarioAutenticado, postulacionId: string): Promise<ListadoFormatosDto> {
    await exigirAlcance(user, postulacionId);
    const ctx = await cargarContexto(postulacionId);
    if (!ctx) throw AppError.noEncontrado();

    const { data, error } = await supabaseAdmin
      .from('formato_generado')
      .select(COLUMNAS_PUBLICAS)
      .eq('postulacion_id', postulacionId)
      .order('generado_en', { ascending: false });
    if (error) {
      if (esTablaInexistente(error)) throw AppError.interno('El modulo de formatos no esta disponible: falta aplicar la migracion 0015');
      throw AppError.interno(`No fue posible leer los formatos: ${error.message}`);
    }
    const filas = (data ?? []) as FormatoRow[];

    const formatos = TIPOS_FORMATO.map((tipo) => {
      const vigente = filas.find((f) => f.tipo === tipo && f.vigente && f.estado === 'LISTO') ?? null;
      if (vigente) {
        const actualizado = calcularHashContenido(ctx, tipo) === vigente.hash_contenido;
        return {
          tipo,
          situacion: actualizado ? EstadoVigenciaFormato.VIGENTE : EstadoVigenciaFormato.DESACTUALIZADO,
          formato: aDto(vigente),
        };
      }
      // Sin vigente: se informa el ultimo intento en curso o fallido para que la interfaz lo muestre.
      const reciente = filas.find((f) => f.tipo === tipo && (f.estado === EstadoFormato.GENERANDO || f.estado === EstadoFormato.FALLIDO)) ?? null;
      return { tipo, situacion: EstadoVigenciaFormato.NO_GENERADO, formato: reciente ? aDto(reciente) : null };
    });

    const esDueno = user.rol === 'BENEFICIARIO';
    const admite = admiteGeneracion(ctx);
    let motivo: string | null = null;
    if (!esDueno) motivo = 'Solo el beneficiario puede generar formatos';
    else if (!admite) motivo = 'Solo es posible generar formatos mientras la postulación está en borrador o en corrección dentro del plazo';
    return { puede_generar: esDueno && admite, motivo_bloqueo: motivo, formatos };
  }

  async obtener(user: UsuarioAutenticado, id: string): Promise<FormatoGeneradoDto> {
    const formato = await leerFormato(id);
    if (!formato) throw AppError.noEncontrado();
    await exigirAlcance(user, formato.postulacion_id);
    return aDto(formato);
  }

  async urlDescarga(user: UsuarioAutenticado, contextoAud: ContextoAuditoria, id: string): Promise<DescargaFormatoDto> {
    const formato = await leerFormato(id);
    if (!formato) throw AppError.noEncontrado();
    await exigirAlcance(user, formato.postulacion_id);
    if (formato.estado !== 'LISTO' || !formato.storage_key) {
      throw AppError.conflicto('FORMATO_NO_DISPONIBLE', 'El formato aún no está listo para descargar');
    }
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_FORMATOS).createSignedUrl(formato.storage_key, SEGUNDOS_URL_DESCARGA);
    if (error || !data?.signedUrl) throw AppError.interno('No fue posible generar la URL de descarga');
    const expiraEn = new Date(Date.now() + SEGUNDOS_URL_DESCARGA * 1000).toISOString();

    await auditar({
      ...contextoAud,
      accion: 'DESCARGA_DOCUMENTO',
      entidad: 'FORMATO_GENERADO',
      entidad_id: formato.id,
      metadatos: { tipo: formato.tipo, postulacion_id: formato.postulacion_id, vigente: formato.vigente },
    });
    return { url: data.signedUrl, expira_en: expiraEn };
  }
}

export const formatoService = new FormatoService();
export { hashContenidoService };
