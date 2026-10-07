import { createHash, randomUUID } from 'node:crypto';
import {
  DOCUMENTOS_URL_LECTURA_SEG,
  type ConfirmarDocumentoDto,
  type ConfirmarRespuestaDto,
  type DocumentoDto,
  type DocumentoFaltanteDto,
  type DocumentoVersionDto,
  type DocumentosPostulacionDto,
  type EstadoCarga,
  type ExigibleDto,
  type TipoDocumento,
  type TipoDocumentoDto,
  type TipoSolicitud,
  type UploadUrlDto,
  type UploadUrlRespuestaDto,
  type UrlLecturaDto,
} from '@foest/shared';
import { env } from '../../config/env';
import { AppError, auditar, logger, supabaseAdmin, tienePermiso, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { configuracionService } from '../catalogos_configuracion';
import { encolarNotificacion } from '../notificaciones';
import { auditarFueraDeTx } from '../auditoria/auditoria.cola';
import { AntivirusNoDisponibleError, obtenerAntivirus } from './antivirus.service';
import { validarArchivo } from './file-validator';
import { obtenerExpedienteAccessPort } from './ports/expediente-access.port';
import { obtenerFormatoVigentePort, tipoRequiereFormato } from './ports/formato-vigente.port';
import { requisitosService, TIPO_CARGA_VOLUNTARIA } from './requisitos.service';
import { claveObjeto, storageDocumentos } from './storage.service';
import type { DocumentoRow, DocumentoVersionRow, PostulacionDocumentos, SolicitanteDocumento, TipoDocumentoRow } from './documento.types';

/** Contexto de auditoria tomado de la peticion (contextoDesdeRequest). */
export type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

const MB = 1024 * 1024;
const HORAS_PURGA_SUBIENDO = 24;
const MINUTOS_REINTENTO_ESCANEO = 1;
const CAMPOS_POSTULACION = 'id, beneficiario_id, convocatoria_id, tipo_solicitud, estado, fecha_limite_subsanacion, ciclo';
const CAMPOS_TIPO = 'id, codigo, nombre, descripcion, formato_oficial';

// ---------------------------------------------------------------------------
// Lectura de datos
// ---------------------------------------------------------------------------

async function leerLimites(): Promise<{ maxArchivoMb: number; cuotaMb: number }> {
  const maxArchivoMb = await configuracionService.getEntero('MAX_TAMANO_ARCHIVO_MB', 10);
  const cuotaMb = await configuracionService.getEntero('CUOTA_POSTULACION_MB', 30);
  return { maxArchivoMb, cuotaMb };
}

async function cargarPostulacion(id: string): Promise<PostulacionDocumentos | null> {
  const { data, error } = await supabaseAdmin.from('postulacion').select(CAMPOS_POSTULACION).eq('id', id).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar la postulacion: ${error.message}`);
  return (data as PostulacionDocumentos | null) ?? null;
}

async function beneficiosDePostulacion(postulacionId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from('postulacion_beneficio').select('beneficio_codigo').eq('postulacion_id', postulacionId);
  if (error) throw AppError.interno(`No fue posible cargar los beneficios de la postulacion: ${error.message}`);
  return ((data ?? []) as Array<{ beneficio_codigo: string }>).map((b) => b.beneficio_codigo);
}

async function cargarTipos(): Promise<TipoDocumentoRow[]> {
  const { data, error } = await supabaseAdmin.from('tipo_documento').select(CAMPOS_TIPO);
  if (error) throw AppError.interno(`No fue posible cargar el catalogo de tipos: ${error.message}`);
  return (data ?? []) as TipoDocumentoRow[];
}

async function cargarDocumento(id: string): Promise<DocumentoRow | null> {
  const { data, error } = await supabaseAdmin.from('documento').select('*').eq('id', id).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar el documento: ${error.message}`);
  return (data as DocumentoRow | null) ?? null;
}

async function versionesDe(documentoIds: string[]): Promise<DocumentoVersionRow[]> {
  if (documentoIds.length === 0) return [];
  const { data, error } = await supabaseAdmin.from('documento_version').select('*').in('documento_id', documentoIds).order('version', { ascending: true });
  if (error) throw AppError.interno(`No fue posible cargar las versiones: ${error.message}`);
  return (data ?? []) as DocumentoVersionRow[];
}

async function documentosActivos(postulacionId: string): Promise<DocumentoRow[]> {
  const { data, error } = await supabaseAdmin.from('documento').select('*').eq('postulacion_id', postulacionId).eq('eliminado', false);
  if (error) throw AppError.interno(`No fue posible cargar los documentos: ${error.message}`);
  return (data ?? []) as DocumentoRow[];
}

async function beneficiarioIdDeUsuario(usuarioId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('beneficiario').select('id').eq('usuario_id', usuarioId).maybeSingle();
  if (error) throw AppError.interno(`No fue posible cargar el perfil: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

async function usuarioDeBeneficiario(beneficiarioId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('beneficiario').select('usuario_id').eq('id', beneficiarioId).maybeSingle();
  return (data as { usuario_id: string } | null)?.usuario_id ?? null;
}

// ---------------------------------------------------------------------------
// Reglas de alcance y estado
// ---------------------------------------------------------------------------

/** Postulacion propia del beneficiario; ajena o inexistente -> 404. */
async function cargarPostulacionPropia(user: UsuarioAutenticado, postulacionId: string): Promise<PostulacionDocumentos> {
  const p = await cargarPostulacion(postulacionId);
  const beneficiarioId = await beneficiarioIdDeUsuario(user.id);
  if (!p || !beneficiarioId || p.beneficiario_id !== beneficiarioId) throw AppError.noEncontrado();
  return p;
}

/** Alcance de lectura: dueno, funcionario con asignacion activa, administrador. */
async function puedeLeer(solicitante: SolicitanteDocumento, p: PostulacionDocumentos): Promise<boolean> {
  if (solicitante.rol === 'ADMINISTRADOR') return true;
  if (solicitante.rol === 'BENEFICIARIO') return (await beneficiarioIdDeUsuario(solicitante.id)) === p.beneficiario_id;
  if (solicitante.rol === 'FUNCIONARIO') return obtenerExpedienteAccessPort().funcionarioPuedeVer(solicitante.id, p.id);
  return false;
}

async function exigirLectura(solicitante: SolicitanteDocumento, postulacionId: string): Promise<PostulacionDocumentos> {
  const p = await cargarPostulacion(postulacionId);
  if (!p || !(await puedeLeer(solicitante, p))) throw AppError.noEncontrado();
  return p;
}

interface EstadoEdicion {
  editable: boolean;
  motivo: string | null;
}

function evaluarEdicion(p: PostulacionDocumentos, ahora = new Date()): EstadoEdicion {
  if (p.estado === 'BORRADOR') return { editable: true, motivo: null };
  if (p.estado === 'EN_CORRECCION') {
    if (p.fecha_limite_subsanacion && new Date(p.fecha_limite_subsanacion).getTime() < ahora.getTime()) {
      return { editable: false, motivo: 'El plazo de subsanacion vencio; ya no es posible modificar los soportes.' };
    }
    return { editable: true, motivo: null };
  }
  return { editable: false, motivo: 'Los soportes solo pueden modificarse mientras la postulacion esta en borrador o en correccion dentro del plazo.' };
}

function exigirEditable(p: PostulacionDocumentos): void {
  const e = evaluarEdicion(p);
  if (!e.editable) throw AppError.conflicto('DOCUMENTO_BLOQUEADO', e.motivo ?? 'Los soportes no pueden modificarse en este momento');
}

/** Documento propio y no eliminado, con su postulacion; si no, 404. */
async function cargarDocumentoPropio(user: UsuarioAutenticado, documentoId: string): Promise<{ doc: DocumentoRow; p: PostulacionDocumentos }> {
  const doc = await cargarDocumento(documentoId);
  if (!doc || doc.eliminado) throw AppError.noEncontrado();
  const p = await cargarPostulacionPropia(user, doc.postulacion_id);
  return { doc, p };
}

// ---------------------------------------------------------------------------
// Versiones, vigencia y cuota
// ---------------------------------------------------------------------------

/**
 * Vigente = ultima version DISPONIBLE; si no hay ninguna, la mas reciente (para mostrar el intento
 * en curso o rechazado). Mantiene `documento` sincronizado con esa version.
 */
async function recomputarVigente(documentoId: string): Promise<DocumentoRow | null> {
  const versiones = await versionesDe([documentoId]);
  if (versiones.length === 0) return null;
  const disponibles = versiones.filter((v) => v.estado_carga === 'DISPONIBLE');
  const vigente = disponibles.length > 0 ? disponibles[disponibles.length - 1]! : versiones[versiones.length - 1]!;
  const { data, error } = await supabaseAdmin
    .from('documento')
    .update({
      version_actual: vigente.version,
      estado_carga: vigente.estado_carga,
      storage_key: vigente.storage_key,
      nombre_original: vigente.nombre_original,
      mime_type: vigente.mime_type,
      tamano_bytes: vigente.tamano_bytes,
      sha256: vigente.sha256,
      formato_generado_id: vigente.formato_generado_id,
      subido_en: vigente.disponible_en ?? vigente.creado_en,
    })
    .eq('id', documentoId)
    .select('*')
    .maybeSingle();
  if (error) throw AppError.interno(`No fue posible actualizar el documento: ${error.message}`);
  return (data as DocumentoRow | null) ?? null;
}

/** Bytes que ocupan las versiones vigentes y las cargas en curso de una postulacion. */
async function bytesUsados(postulacionId: string, excluirVersionId?: string): Promise<number> {
  const docs = await documentosActivos(postulacionId);
  const versiones = await versionesDe(docs.map((d) => d.id));
  const versionActual = new Map(docs.map((d) => [d.id, d.version_actual]));
  let total = 0;
  for (const v of versiones) {
    if (v.id === excluirVersionId) continue;
    const tam = Number(v.tamano_bytes ?? 0);
    if (v.estado_carga === 'SUBIENDO' || v.estado_carga === 'ESCANEANDO') total += tam;
    else if (v.estado_carga === 'DISPONIBLE' && v.version === versionActual.get(v.documento_id)) total += tam;
  }
  return total;
}

async function eliminarVersiones(versiones: DocumentoVersionRow[]): Promise<void> {
  if (versiones.length === 0) return;
  await storageDocumentos.eliminar(versiones.map((v) => v.storage_key));
  const { error } = await supabaseAdmin.from('documento_version').delete().in('id', versiones.map((v) => v.id));
  if (error) throw AppError.interno(`No fue posible limpiar las versiones: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Serializacion
// ---------------------------------------------------------------------------

function aVersionDto(v: DocumentoVersionRow): DocumentoVersionDto {
  return {
    version: v.version,
    estado_carga: v.estado_carga,
    nombre_original: v.nombre_original,
    mime_type: v.mime_type,
    tamano_bytes: v.tamano_bytes === null ? null : Number(v.tamano_bytes),
    motivo_rechazo_archivo: v.motivo_rechazo_archivo,
    motivo_reemplazo: v.motivo_reemplazo,
    formato_generado_id: v.formato_generado_id,
    creado_en: v.creado_en,
    disponible_en: v.disponible_en,
  };
}

function aDocumentoDto(doc: DocumentoRow, versiones: DocumentoVersionRow[], tipo: TipoDocumentoRow): DocumentoDto {
  const propias = versiones.filter((v) => v.documento_id === doc.id).sort((a, b) => a.version - b.version);
  const posteriores = propias.filter((v) => v.version > doc.version_actual);
  const enCurso = posteriores.length > 0 ? posteriores[posteriores.length - 1]! : null;
  return {
    id: doc.id,
    postulacion_id: doc.postulacion_id,
    tipo_codigo: tipo.codigo,
    tipo_nombre: tipo.nombre,
    version_actual: doc.version_actual,
    estado_carga: doc.estado_carga,
    nombre_original: doc.nombre_original,
    mime_type: doc.mime_type,
    tamano_bytes: doc.tamano_bytes === null ? null : Number(doc.tamano_bytes),
    formato_generado_id: doc.formato_generado_id,
    subido_en: doc.subido_en,
    version_en_curso: enCurso ? aVersionDto(enCurso) : null,
    versiones: propias.map(aVersionDto),
  };
}

// ---------------------------------------------------------------------------
// Auditoria y notificacion
// ---------------------------------------------------------------------------

async function registrar(ctx: ContextoAuditoria | null, evento: Omit<EventoAuditoria, keyof ContextoAuditoria>): Promise<void> {
  if (ctx) {
    await auditar({ ...ctx, ...evento });
    return;
  }
  await auditarFueraDeTx({ actor_tipo: 'SISTEMA', ...evento });
}

async function notificarRechazo(p: PostulacionDocumentos, tipoNombre: string, motivo: string, versionId: string): Promise<void> {
  try {
    const usuarioId = await usuarioDeBeneficiario(p.beneficiario_id);
    if (!usuarioId) return;
    await encolarNotificacion({
      usuario_id: usuarioId,
      tipo: 'SISTEMA',
      titulo: 'Soporte rechazado',
      mensaje: `El archivo cargado como "${tipoNombre}" fue rechazado: ${motivo}. Cargue un archivo nuevo para continuar.`,
      entidad: 'POSTULACION',
      entidad_id: p.id,
      url_destino: `/beneficiario/postulaciones/${p.id}/documentos`,
      severidad: 'ADVERTENCIA',
      canal: 'APP',
      clave_dedup: `documento-rechazado:${versionId}`,
    });
  } catch (e) {
    logger.error({ err: e }, 'No fue posible notificar el rechazo del soporte');
  }
}

/** Marca una version como RECHAZADO_ARCHIVO, elimina su objeto, audita y notifica. */
async function rechazarVersion(
  ctx: ContextoAuditoria | null,
  doc: DocumentoRow,
  p: PostulacionDocumentos,
  version: DocumentoVersionRow,
  tipo: TipoDocumentoRow,
  motivo: string,
  causa: string,
): Promise<void> {
  try {
    await storageDocumentos.eliminar([version.storage_key]);
  } catch (e) {
    logger.error({ err: e, documento_id: doc.id }, 'No fue posible eliminar el objeto rechazado');
  }
  const { error } = await supabaseAdmin
    .from('documento_version')
    .update({ estado_carga: 'RECHAZADO_ARCHIVO', motivo_rechazo_archivo: motivo })
    .eq('id', version.id)
    .in('estado_carga', ['SUBIENDO', 'ESCANEANDO']);
  if (error) throw AppError.interno(`No fue posible rechazar la version: ${error.message}`);
  await recomputarVigente(doc.id);
  await registrar(ctx, {
    accion: 'ACTUALIZAR',
    entidad: 'DOCUMENTO',
    entidad_id: doc.id,
    resultado: 'EXITO',
    metadatos: { evento: 'DOCUMENTO_RECHAZADO_ARCHIVO', tipo: tipo.codigo, version: version.version, causa, motivo, postulacion_id: p.id },
  });
  await notificarRechazo(p, tipo.nombre, motivo, version.id);
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

const escaneosEnCurso = new Set<string>();

export class DocumentoService {
  /** Exigibles de una postulacion (beneficios y tramite propios). */
  async exigiblesDePostulacion(p: PostulacionDocumentos): Promise<ExigibleDto[]> {
    return requisitosService.calcularExigibles(await beneficiosDePostulacion(p.id), p.tipo_solicitud);
  }

  /** POST /postulaciones/:id/documentos/upload-url */
  async solicitarSubida(user: UsuarioAutenticado, ctx: ContextoAuditoria, postulacionId: string, dto: UploadUrlDto): Promise<UploadUrlRespuestaDto> {
    if (user.rol !== 'BENEFICIARIO') throw AppError.sinPermiso();
    const p = await cargarPostulacionPropia(user, postulacionId);
    exigirEditable(p);

    const { maxArchivoMb, cuotaMb } = await leerLimites();
    if (dto.tamano_bytes > maxArchivoMb * MB) {
      throw AppError.datosInvalidos('TAMANO_EXCEDIDO', `El archivo supera el maximo permitido de ${maxArchivoMb} MB`, { max_mb: maxArchivoMb });
    }

    const tipos = await cargarTipos();
    const tipo = tipos.find((t) => t.codigo === dto.tipo_codigo);
    if (!tipo) throw AppError.datosInvalidos('TIPO_NO_EXIGIBLE', 'El tipo de documento no existe');
    const exigibles = await this.exigiblesDePostulacion(p);
    if (tipo.codigo !== TIPO_CARGA_VOLUNTARIA && !exigibles.some((e) => e.codigo === tipo.codigo)) {
      throw AppError.datosInvalidos('TIPO_NO_EXIGIBLE', 'El tipo de documento no corresponde a los beneficios o al tramite de la postulacion');
    }

    // Formato oficial vigente (FORM_INS / PAG_CART).
    let formatoId: string | null = null;
    if (tipoRequiereFormato(tipo.codigo)) {
      const resultado = await obtenerFormatoVigentePort().verificar(p.id, tipo.codigo, dto.formato_generado_id);
      if (resultado === 'FORMATO_NO_VIGENTE') {
        throw AppError.datosInvalidos('FORMATO_NO_VIGENTE', 'Debe vincular un formato oficial vigente, generado para esta postulacion y del tipo correcto');
      }
      formatoId = dto.formato_generado_id ?? null;
    }

    // Documento existente de ese tipo (un documento por tipo entre los no eliminados).
    const activos = await documentosActivos(p.id);
    let doc = activos.find((d) => d.tipo_id === tipo.id) ?? null;
    let versiones = doc ? await versionesDe([doc.id]) : [];
    if (doc) {
      if (versiones.some((v) => v.estado_carga === 'ESCANEANDO')) {
        throw AppError.conflicto('CARGA_EN_CURSO', 'El archivo anterior aun se esta verificando; espere un momento e intente de nuevo');
      }
      // Reservas sin confirmar: se reemplazan por la nueva.
      await eliminarVersiones(versiones.filter((v) => v.estado_carga === 'SUBIENDO'));
      versiones = versiones.filter((v) => v.estado_carga !== 'SUBIENDO');
      if (versiones.length === 0) {
        const { error } = await supabaseAdmin.from('documento').delete().eq('id', doc.id);
        if (error) throw AppError.interno(`No fue posible reiniciar el documento: ${error.message}`);
        doc = null;
      } else {
        doc = (await recomputarVigente(doc.id)) ?? doc;
      }
    }

    const reemplaza = doc !== null && doc.estado_carga === 'DISPONIBLE';
    let motivoReemplazo: string | null = null;
    if (reemplaza) {
      if (!tienePermiso(user.rol, 'documento:reemplazar')) throw AppError.sinPermiso();
      if (p.estado === 'EN_CORRECCION' && !dto.motivo_reemplazo) {
        throw AppError.datosInvalidos('MOTIVO_REEMPLAZO_REQUERIDO', 'Indique el motivo del reemplazo del soporte');
      }
      motivoReemplazo = dto.motivo_reemplazo ?? 'Reemplazo antes del envio de la postulacion';
    }

    // Cuota por postulacion (vigentes + cargas en curso + el nuevo archivo).
    const usado = await bytesUsados(p.id);
    if (usado + dto.tamano_bytes > cuotaMb * MB) {
      throw AppError.datosInvalidos('CUOTA_EXCEDIDA', `La suma de los soportes supera la cuota de ${cuotaMb} MB por postulacion`, {
        cuota_mb: cuotaMb,
        usado_bytes: usado,
      });
    }

    const documentoId = doc?.id ?? randomUUID();
    const version = versiones.length > 0 ? Math.max(...versiones.map((v) => v.version)) + 1 : 1;
    const key = claveObjeto(p.id, documentoId, version);
    const nombre = dto.nombre_original ? sanearNombre(dto.nombre_original) : null;

    const esNuevo = doc === null;
    if (esNuevo) {
      const { error } = await supabaseAdmin.from('documento').insert({
        id: documentoId,
        postulacion_id: p.id,
        tipo_id: tipo.id,
        version_actual: 1,
        estado_carga: 'SUBIENDO',
        storage_key: key,
        nombre_original: nombre,
        mime_type: dto.mime,
        tamano_bytes: dto.tamano_bytes,
        formato_generado_id: formatoId,
      });
      if (error) {
        if (error.code === '23505') throw AppError.conflicto('CARGA_EN_CURSO', 'Ya existe una carga en curso para este tipo de documento');
        throw AppError.interno(`No fue posible reservar el documento: ${error.message}`);
      }
    }
    const { error: errVersion } = await supabaseAdmin.from('documento_version').insert({
      documento_id: documentoId,
      version,
      storage_key: key,
      nombre_original: nombre,
      mime_type: dto.mime,
      tamano_bytes: dto.tamano_bytes,
      estado_carga: 'SUBIENDO',
      formato_generado_id: formatoId,
      motivo_reemplazo: motivoReemplazo,
    });
    if (errVersion) {
      if (esNuevo) await supabaseAdmin.from('documento').delete().eq('id', documentoId);
      if (errVersion.code === '23505') throw AppError.conflicto('CARGA_EN_CURSO', 'Ya existe una carga en curso para este tipo de documento');
      throw AppError.interno(`No fue posible reservar la version: ${errVersion.message}`);
    }

    let url: string;
    try {
      ({ url } = await storageDocumentos.crearUrlSubida(key));
    } catch (e) {
      await supabaseAdmin.from('documento_version').delete().eq('documento_id', documentoId).eq('version', version);
      if (esNuevo) await supabaseAdmin.from('documento').delete().eq('id', documentoId);
      throw e;
    }
    await recomputarVigente(documentoId);

    await auditar({
      ...ctx,
      accion: 'CREAR',
      entidad: 'DOCUMENTO',
      entidad_id: documentoId,
      resultado: 'EXITO',
      metadatos: { evento: 'DOCUMENTO_RESERVADO', postulacion_id: p.id, tipo: tipo.codigo, version, tamano_bytes: dto.tamano_bytes, mime: dto.mime, reemplazo: reemplaza },
    });

    return {
      documento_id: documentoId,
      version,
      upload: {
        url,
        method: 'PUT',
        fields: { cacheControl: '3600' },
        campo_archivo: '',
        headers: { ...(env.SUPABASE_ANON_KEY ? { apikey: env.SUPABASE_ANON_KEY } : {}), 'x-upsert': 'false' },
      },
      expira_en: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
  }

  /** POST /documentos/:id/confirmar */
  async confirmar(user: UsuarioAutenticado, ctx: ContextoAuditoria, documentoId: string, dto: ConfirmarDocumentoDto): Promise<ConfirmarRespuestaDto> {
    if (user.rol !== 'BENEFICIARIO') throw AppError.sinPermiso();
    const { doc, p } = await cargarDocumentoPropio(user, documentoId);
    exigirEditable(p);

    const versiones = await versionesDe([doc.id]);
    const version = versiones.find((v) => v.version === dto.version);
    if (!version) throw AppError.noEncontrado();
    const resultado = (estado: EstadoCarga): ConfirmarRespuestaDto => ({ documento_id: doc.id, version: version.version, estado_carga: estado });

    if (version.estado_carga === 'ESCANEANDO' || version.estado_carga === 'DISPONIBLE') return resultado(version.estado_carga);
    if (version.estado_carga === 'RECHAZADO_ARCHIVO') {
      throw AppError.datosInvalidos('ARCHIVO_INVALIDO', version.motivo_rechazo_archivo ?? 'El archivo fue rechazado');
    }

    const tipo = (await cargarTipos()).find((t) => t.id === doc.tipo_id);
    if (!tipo) throw AppError.interno('Tipo de documento inexistente');
    const { maxArchivoMb, cuotaMb } = await leerLimites();

    const tamano = await storageDocumentos.tamano(version.storage_key);
    if (tamano === null || tamano === 0) {
      throw AppError.datosInvalidos('ARCHIVO_INVALIDO', 'No se recibio el archivo; vuelva a intentar la carga');
    }
    if (tamano > maxArchivoMb * MB) {
      const motivo = `El archivo supera el maximo permitido de ${maxArchivoMb} MB`;
      await rechazarVersion(ctx, doc, p, version, tipo, motivo, 'TAMANO_EXCEDIDO');
      throw AppError.datosInvalidos('TAMANO_EXCEDIDO', motivo, { max_mb: maxArchivoMb });
    }

    const contenido = await storageDocumentos.descargar(version.storage_key);
    const sha256 = createHash('sha256').update(contenido).digest('hex');
    if (dto.sha256 && dto.sha256.toLowerCase() !== sha256) {
      const motivo = 'El archivo recibido no coincide con el hash informado';
      await rechazarVersion(ctx, doc, p, version, tipo, motivo, 'HASH_NO_COINCIDE');
      throw AppError.datosInvalidos('HASH_NO_COINCIDE', motivo);
    }

    const validacion = await validarArchivo(contenido, version.mime_type ?? '');
    if (!validacion.ok) {
      await rechazarVersion(ctx, doc, p, version, tipo, validacion.motivo, 'ARCHIVO_INVALIDO');
      throw AppError.datosInvalidos('ARCHIVO_INVALIDO', validacion.motivo);
    }

    const usado = await bytesUsados(p.id, version.id);
    if (usado + contenido.length > cuotaMb * MB) {
      const motivo = `La suma de los soportes supera la cuota de ${cuotaMb} MB por postulacion`;
      await rechazarVersion(ctx, doc, p, version, tipo, motivo, 'CUOTA_EXCEDIDA');
      throw AppError.datosInvalidos('CUOTA_EXCEDIDA', motivo, { cuota_mb: cuotaMb });
    }

    const { data, error } = await supabaseAdmin
      .from('documento_version')
      .update({ sha256, tamano_bytes: contenido.length, mime_type: validacion.mime, estado_carga: 'ESCANEANDO' })
      .eq('id', version.id)
      .eq('estado_carga', 'SUBIENDO')
      .select('id');
    if (error) throw AppError.interno(`No fue posible confirmar el documento: ${error.message}`);
    if (!data || data.length === 0) return resultado('ESCANEANDO'); // otra peticion ya lo confirmo
    await recomputarVigente(doc.id);

    await auditar({
      ...ctx,
      accion: 'ACTUALIZAR',
      entidad: 'DOCUMENTO',
      entidad_id: doc.id,
      resultado: 'EXITO',
      metadatos: { evento: 'DOCUMENTO_CONFIRMADO', postulacion_id: p.id, tipo: tipo.codigo, version: version.version, tamano_bytes: contenido.length, sha256 },
    });

    // Antivirus asincrono: la respuesta no espera el escaneo; el cliente sondea GET /documentos/:id.
    setImmediate(() => {
      void this.escanearVersion(version.id).catch((e) => logger.error({ err: e, version_id: version.id }, 'Fallo el escaneo del documento'));
    });
    return resultado('ESCANEANDO');
  }

  /**
   * Escaneo antivirus de una version en ESCANEANDO. Falla cerrada: si el antivirus no responde la
   * version permanece en ESCANEANDO y el job de rescate la reintenta.
   */
  async escanearVersion(versionId: string): Promise<'DISPONIBLE' | 'RECHAZADO_ARCHIVO' | 'PENDIENTE'> {
    if (escaneosEnCurso.has(versionId)) return 'PENDIENTE';
    escaneosEnCurso.add(versionId);
    try {
      const { data, error } = await supabaseAdmin.from('documento_version').select('*').eq('id', versionId).maybeSingle();
      if (error) throw AppError.interno(`No fue posible cargar la version: ${error.message}`);
      const version = data as DocumentoVersionRow | null;
      if (!version || version.estado_carga !== 'ESCANEANDO') return 'PENDIENTE';
      const doc = await cargarDocumento(version.documento_id);
      if (!doc) return 'PENDIENTE';
      const p = await cargarPostulacion(doc.postulacion_id);
      const tipo = (await cargarTipos()).find((t) => t.id === doc.tipo_id);
      if (!p || !tipo) return 'PENDIENTE';

      let contenido: Buffer;
      try {
        contenido = await storageDocumentos.descargar(version.storage_key);
      } catch (e) {
        logger.warn({ err: e, version_id: versionId }, 'No fue posible leer el objeto para escanearlo; se reintentara');
        return 'PENDIENTE';
      }

      let resultado;
      try {
        resultado = await obtenerAntivirus().escanear(contenido);
      } catch (e) {
        if (e instanceof AntivirusNoDisponibleError) {
          logger.warn({ version_id: versionId, motivo: e.message }, 'Antivirus no disponible; la version permanece en ESCANEANDO');
          return 'PENDIENTE';
        }
        throw e;
      }

      if (!resultado.limpio) {
        await rechazarVersion(null, doc, p, version, tipo, 'Se detecto contenido malicioso en el archivo', `ANTIVIRUS:${resultado.firma ?? 'DESCONOCIDO'}`);
        return 'RECHAZADO_ARCHIVO';
      }

      const { data: actualizado, error: errUpd } = await supabaseAdmin
        .from('documento_version')
        .update({ estado_carga: 'DISPONIBLE', disponible_en: new Date().toISOString(), escaneo: resultado.motor === 'OMITIDO' ? 'OMITIDO' : 'LIMPIO' })
        .eq('id', version.id)
        .eq('estado_carga', 'ESCANEANDO')
        .select('id');
      if (errUpd) throw AppError.interno(`No fue posible habilitar el documento: ${errUpd.message}`);
      if (!actualizado || actualizado.length === 0) return 'PENDIENTE';
      await recomputarVigente(doc.id);
      return 'DISPONIBLE';
    } finally {
      escaneosEnCurso.delete(versionId);
    }
  }

  /** GET /postulaciones/:id/documentos */
  async listarPorPostulacion(solicitante: SolicitanteDocumento, postulacionId: string): Promise<DocumentosPostulacionDto> {
    const p = await exigirLectura(solicitante, postulacionId);
    const [exigibles, tipos, docs, limites] = await Promise.all([this.exigiblesDePostulacion(p), cargarTipos(), documentosActivos(p.id), leerLimites()]);
    const versiones = await versionesDe(docs.map((d) => d.id));
    const porId = new Map(tipos.map((t) => [t.id, t]));
    const documentos = docs
      .map((d) => {
        const tipo = porId.get(d.tipo_id);
        return tipo ? aDocumentoDto(d, versiones, tipo) : null;
      })
      .filter((d): d is DocumentoDto => d !== null)
      .sort((a, b) => a.tipo_codigo.localeCompare(b.tipo_codigo));

    const voluntario = tipos.find((t) => t.codigo === TIPO_CARGA_VOLUNTARIA);
    const opcionales: TipoDocumentoDto[] =
      voluntario && !exigibles.some((e) => e.codigo === voluntario.codigo)
        ? [{ codigo: voluntario.codigo, nombre: voluntario.nombre, descripcion: voluntario.descripcion, formato_oficial: voluntario.formato_oficial }]
        : [];

    const edicion = solicitante.rol === 'BENEFICIARIO' ? evaluarEdicion(p) : { editable: false, motivo: null };
    return {
      exigibles,
      opcionales,
      documentos,
      editable: edicion.editable,
      motivo_bloqueo: edicion.motivo,
      fecha_limite: p.estado === 'EN_CORRECCION' ? p.fecha_limite_subsanacion : null,
      limites: { max_archivo_mb: limites.maxArchivoMb, cuota_postulacion_mb: limites.cuotaMb, usado_bytes: await bytesUsados(p.id) },
    };
  }

  /** GET /documentos/:id (metadatos y estado de carga para sondeo). */
  async obtenerMetadatos(solicitante: SolicitanteDocumento, documentoId: string): Promise<DocumentoDto> {
    const doc = await cargarDocumento(documentoId);
    if (!doc || (doc.eliminado && solicitante.rol !== 'ADMINISTRADOR')) throw AppError.noEncontrado();
    await exigirLectura(solicitante, doc.postulacion_id);
    const tipo = (await cargarTipos()).find((t) => t.id === doc.tipo_id);
    if (!tipo) throw AppError.interno('Tipo de documento inexistente');
    return aDocumentoDto(doc, await versionesDe([doc.id]), tipo);
  }

  /**
   * URL de lectura de 300 s. Solo versiones DISPONIBLE; audita DESCARGA_DOCUMENTO.
   * Documento ajeno o sin alcance: 404.
   */
  async generarUrlLectura(documentoId: string, solicitante: SolicitanteDocumento, opciones: { ctx?: ContextoAuditoria; version?: number } = {}): Promise<UrlLecturaDto> {
    const doc = await cargarDocumento(documentoId);
    if (!doc || (doc.eliminado && solicitante.rol !== 'ADMINISTRADOR')) throw AppError.noEncontrado();
    const p = await exigirLectura(solicitante, doc.postulacion_id);

    const numero = opciones.version ?? doc.version_actual;
    const versiones = await versionesDe([doc.id]);
    const version = versiones.find((v) => v.version === numero);
    if (!version) throw AppError.noEncontrado();
    if (version.estado_carga !== 'DISPONIBLE') {
      throw AppError.conflicto('DOCUMENTO_NO_DISPONIBLE', 'El documento aun no esta disponible para su consulta');
    }

    const url = await storageDocumentos.urlLectura(version.storage_key, DOCUMENTOS_URL_LECTURA_SEG);
    const tipo = (await cargarTipos()).find((t) => t.id === doc.tipo_id);
    await auditar({
      ...(opciones.ctx ?? { actor_id: solicitante.id, actor_rol: solicitante.rol, actor_tipo: 'USUARIO' as const }),
      accion: 'DESCARGA_DOCUMENTO',
      entidad: 'DOCUMENTO',
      entidad_id: doc.id,
      resultado: 'EXITO',
      metadatos: { postulacion_id: p.id, tipo: tipo?.codigo ?? null, version: version.version, expira_seg: DOCUMENTOS_URL_LECTURA_SEG },
    });
    return {
      url,
      expira_en: new Date(Date.now() + DOCUMENTOS_URL_LECTURA_SEG * 1000).toISOString(),
      mime_type: version.mime_type,
      nombre_original: version.nombre_original,
    };
  }

  /** DELETE /documentos/:id (eliminacion logica; el objeto se conserva hasta la retencion). */
  async eliminar(user: UsuarioAutenticado, ctx: ContextoAuditoria, documentoId: string): Promise<void> {
    if (user.rol !== 'BENEFICIARIO') throw AppError.sinPermiso();
    const { doc, p } = await cargarDocumentoPropio(user, documentoId);
    exigirEditable(p);

    const versiones = await versionesDe([doc.id]);
    await eliminarVersiones(versiones.filter((v) => v.estado_carga === 'SUBIENDO'));
    const { error } = await supabaseAdmin
      .from('documento')
      .update({ eliminado: true, eliminado_en: new Date().toISOString(), eliminado_por: user.id })
      .eq('id', doc.id)
      .eq('eliminado', false);
    if (error) throw AppError.interno(`No fue posible eliminar el documento: ${error.message}`);

    const tipo = (await cargarTipos()).find((t) => t.id === doc.tipo_id);
    await auditar({
      ...ctx,
      accion: 'ELIMINAR',
      entidad: 'DOCUMENTO',
      entidad_id: doc.id,
      resultado: 'EXITO',
      datos_antes: { tipo: tipo?.codigo ?? null, version_actual: doc.version_actual, estado_carga: doc.estado_carga },
      metadatos: { evento: 'DOCUMENTO_ELIMINADO', postulacion_id: p.id, eliminacion: 'LOGICA' },
    });
  }

  // -------------------------------------------------------------------------
  // API para otros modulos
  // -------------------------------------------------------------------------

  /** Documentos exigibles para unos beneficios y un tramite (la matriz no varia por convocatoria). */
  async documentosExigibles(_convocatoriaId: string, beneficios: readonly string[], tipoSolicitud: TipoSolicitud): Promise<ExigibleDto[]> {
    return requisitosService.calcularExigibles(beneficios, tipoSolicitud);
  }

  /** Estado documental de una postulacion: exigibles, lo cargado y lo que falta. */
  async estadoDocumentosPostulacion(postulacionId: string): Promise<{
    exigibles: ExigibleDto[];
    documentos: Array<{ tipo_codigo: TipoDocumento; estado_carga: EstadoCarga; version_actual: number }>;
    faltantes: DocumentoFaltanteDto[];
    completo: boolean;
  }> {
    const p = await cargarPostulacion(postulacionId);
    if (!p) throw AppError.noEncontrado();
    const [exigibles, tipos, docs] = await Promise.all([this.exigiblesDePostulacion(p), cargarTipos(), documentosActivos(p.id)]);
    const codigoPorId = new Map(tipos.map((t) => [t.id, t.codigo]));
    const documentos = docs
      .map((d) => ({ tipo_codigo: codigoPorId.get(d.tipo_id) as TipoDocumento, estado_carga: d.estado_carga, version_actual: d.version_actual }))
      .filter((d) => d.tipo_codigo !== undefined);
    const faltantes: DocumentoFaltanteDto[] = [];
    for (const e of exigibles) {
      if (!e.obligatorio) continue;
      const cargado = documentos.find((d) => d.tipo_codigo === e.codigo);
      if (!cargado) faltantes.push({ tipo: e.codigo, obligatorio: true, estado: 'SIN_CARGAR' });
      else if (cargado.estado_carga !== 'DISPONIBLE') faltantes.push({ tipo: e.codigo, obligatorio: true, estado: cargado.estado_carga });
    }
    return { exigibles, documentos, faltantes, completo: faltantes.length === 0 };
  }

  /** Obligatorios sin soporte DISPONIBLE (solo DISPONIBLE cuenta para validar y enviar). */
  async documentosFaltantes(postulacionId: string): Promise<DocumentoFaltanteDto[]> {
    return (await this.estadoDocumentosPostulacion(postulacionId)).faltantes;
  }

  /** Elimina los objetos de una postulacion (al borrar un BORRADOR). Las filas caen en cascada. */
  async purgarDocumentosDePostulacion(postulacionId: string): Promise<number> {
    const { data, error } = await supabaseAdmin.from('documento').select('id').eq('postulacion_id', postulacionId);
    if (error) throw AppError.interno(`No fue posible listar los documentos: ${error.message}`);
    const versiones = await versionesDe(((data ?? []) as Array<{ id: string }>).map((d) => d.id));
    const claves = versiones.map((v) => v.storage_key);
    for (let i = 0; i < claves.length; i += 100) await storageDocumentos.eliminar(claves.slice(i, i + 100));
    return claves.length;
  }

  // -------------------------------------------------------------------------
  // Jobs
  // -------------------------------------------------------------------------

  /** Elimina objeto y fila de las versiones en SUBIENDO con mas de 24 h (y el documento si queda sin versiones). */
  async purgarSubiendo(ahora = new Date()): Promise<number> {
    const limite = new Date(ahora.getTime() - HORAS_PURGA_SUBIENDO * 3600 * 1000).toISOString();
    const { data, error } = await supabaseAdmin.from('documento_version').select('*').eq('estado_carga', 'SUBIENDO').lt('creado_en', limite).limit(500);
    if (error) throw AppError.interno(`No fue posible listar las cargas vencidas: ${error.message}`);
    const vencidas = (data ?? []) as DocumentoVersionRow[];
    if (vencidas.length === 0) return 0;
    await eliminarVersiones(vencidas);
    for (const documentoId of new Set(vencidas.map((v) => v.documento_id))) {
      const restantes = await versionesDe([documentoId]);
      if (restantes.length === 0) await supabaseAdmin.from('documento').delete().eq('id', documentoId);
      else await recomputarVigente(documentoId);
    }
    return vencidas.length;
  }

  /** Reintenta el escaneo de versiones que quedaron en ESCANEANDO (antivirus caido o proceso reiniciado). */
  async reintentarEscaneos(ahora = new Date()): Promise<number> {
    const limite = new Date(ahora.getTime() - MINUTOS_REINTENTO_ESCANEO * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin.from('documento_version').select('id').eq('estado_carga', 'ESCANEANDO').lt('creado_en', limite).limit(50);
    if (error) throw AppError.interno(`No fue posible listar los escaneos pendientes: ${error.message}`);
    const ids = ((data ?? []) as Array<{ id: string }>).map((v) => v.id);
    for (const id of ids) await this.escanearVersion(id);
    return ids.length;
  }

  /** Purga objetos y filas de documentos eliminados logicamente tras RETENCION_DOCUMENTOS_ANIOS (vacio = no actua). */
  async purgarRetencion(ahora = new Date()): Promise<number> {
    const anios = await configuracionService.getEntero('RETENCION_DOCUMENTOS_ANIOS', 0);
    if (!anios || anios <= 0) return 0;
    const limite = new Date(ahora);
    limite.setFullYear(limite.getFullYear() - anios);
    const { data, error } = await supabaseAdmin.from('documento').select('id, postulacion_id').eq('eliminado', true).lt('eliminado_en', limite.toISOString()).limit(200);
    if (error) throw AppError.interno(`No fue posible listar los documentos a purgar: ${error.message}`);
    const docs = (data ?? []) as Array<{ id: string; postulacion_id: string }>;
    if (docs.length === 0) return 0;
    const versiones = await versionesDe(docs.map((d) => d.id));
    await storageDocumentos.eliminar(versiones.map((v) => v.storage_key));
    const { error: errDel } = await supabaseAdmin.from('documento').delete().in('id', docs.map((d) => d.id));
    if (errDel) throw AppError.interno(`No fue posible purgar los documentos: ${errDel.message}`);
    for (const d of docs) {
      await auditarFueraDeTx({
        actor_tipo: 'SISTEMA',
        accion: 'PURGA_RETENCION',
        entidad: 'DOCUMENTO',
        entidad_id: d.id,
        resultado: 'EXITO',
        metadatos: { postulacion_id: d.postulacion_id, retencion_anios: anios },
      });
    }
    return docs.length;
  }
}

/** Nombre original saneado: sin rutas ni caracteres de control; solo se conserva en BD. */
export function sanearNombre(nombre: string): string {
  // eslint-disable-next-line no-control-regex
  const limpio = nombre.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]+/g, '_').trim();
  return limpio.slice(0, 200) || 'archivo';
}

export const documentoService = new DocumentoService();
