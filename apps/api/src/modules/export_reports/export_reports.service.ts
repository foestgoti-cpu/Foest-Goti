import crypto from 'node:crypto';
import {
  PERMISO_EXPORTAR_SENSIBLE,
  TIPO_REPORTE_POR_FORMATO,
  type DescargaReporteDto,
  type FiltrosConsolidado,
  type Paginado,
  type MisReportesQuery,
  type ReporteDto,
  type Rol,
  type SolicitarConsolidadoInput,
  type SolicitudReporteRespuestaDto,
  SolicitarConsolidadoInputSchema,
} from '@foest/shared';
import { AppError, auditar, logger, supabaseAdmin, tienePermiso, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { configuracionService } from '../catalogos_configuracion';
import { encolarNotificacion } from '../notificaciones';
import { columnasPara } from './consolidado.columnas';
import { cargarTodasLasFilas, listarIdsExpedientes, type ConvocatoriaMinima } from './consolidado.query';
import { generarCsv } from './csv.service';
import { generarHtml, HtmlDemasiadoGrandeError, type CriterioFila } from './html.service';
import {
  BUCKET_REPORTES,
  ERRORES_REPORTE,
  RETENCION_HORAS_DEFECTO,
  SEGUNDOS_URL_DESCARGA,
  UMBRAL_SINCRONO_DEFECTO,
  type ArchivoGenerado,
  type ReporteRow,
} from './export_reports.types';

type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

const COLUMNAS_REPORTE = '*, convocatoria:convocatoria_id(nombre)';
const MAX_INTENTOS = 3;
const ROL_TEXTO: Record<string, string> = { ADMINISTRADOR: 'Administrador', FUNCIONARIO: 'Funcionario' };
const TEXTO_TIPO_SOLICITUD: Record<string, string> = { PRIMERA_VEZ: 'Primera vez', RENOVACION: 'Renovación', REINTEGRO: 'Reintegro' };

/** Error interno con codigo generico persistible (sin datos personales). */
class ErrorReporte extends Error {
  constructor(readonly codigo: string, mensaje: string) {
    super(mensaje);
  }
}

type FilaConConvocatoria = ReporteRow & { convocatoria?: { nombre: string } | null };

export function normalizarFiltros(filtros: FiltrosConsolidado | undefined): FiltrosConsolidado {
  const f = filtros ?? {};
  const salida: Record<string, string> = {};
  for (const clave of ['beneficio', 'desde', 'estado', 'hasta', 'tipo_solicitud'] as const) {
    const v = f[clave];
    if (v !== undefined && v !== null && v !== '') salida[clave] = v;
  }
  return salida as FiltrosConsolidado;
}

export function huellaParametros(usuarioId: string, tipo: string, convocatoriaId: string, filtros: FiltrosConsolidado, sensibles: boolean): string {
  return crypto.createHash('sha256').update(JSON.stringify({ u: usuarioId, t: tipo, c: convocatoriaId, f: filtros, s: sensibles })).digest('hex');
}

export function aDto(r: FilaConConvocatoria): ReporteDto {
  return {
    id: r.id,
    tipo: r.tipo,
    estado: r.estado,
    convocatoria_id: r.convocatoria_id,
    convocatoria_nombre: r.convocatoria?.nombre ?? null,
    filtros: (r.parametros?.filtros as FiltrosConsolidado | undefined) ?? null,
    filas_total: r.filas_total,
    tamano_bytes: r.tamano_bytes === null ? null : Number(r.tamano_bytes),
    error: r.error,
    creado_en: r.creado_en,
    finalizado_en: r.finalizado_en,
    expira_en: r.expira_en,
    incluye_sensibles: r.incluye_sensibles,
  };
}

/** `consolidado-<convocatoria>-<fecha>.html` saneado: solo [a-z0-9-], sin tildes ni caracteres de ruta. */
export function nombreArchivoHtml(convocatoria: string, fecha: Date): string {
  const slug =
    convocatoria
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'convocatoria';
  return `consolidado-${slug}-${fecha.toISOString().slice(0, 10)}.html`;
}

function extensionLegada(tipo: string): string {
  return tipo === 'CONSOLIDADO_XLSX' ? 'xlsx' : tipo === 'CONSOLIDADO_HTML' ? 'html' : tipo === 'RESUMEN_PDF' ? 'pdf' : 'csv';
}

function fallo(mensaje: string, error: { message?: string } | null): never {
  throw AppError.interno(`${mensaje}: ${error?.message ?? 'error desconocido'}`);
}

function descripcionFiltros(f: FiltrosConsolidado): string {
  const partes: string[] = [];
  if (f.estado) partes.push(`estado=${f.estado}`);
  if (f.tipo_solicitud) partes.push(`tipo=${f.tipo_solicitud}`);
  if (f.beneficio) partes.push(`beneficio=${f.beneficio}`);
  if (f.desde) partes.push(`desde=${f.desde}`);
  if (f.hasta) partes.push(`hasta=${f.hasta}`);
  return partes.length > 0 ? partes.join(', ') : 'sin filtros';
}

export class ExportReportsService {
  // ------------------------------------------------------------------ alcance

  /** Convocatoria visible para el usuario (funcionario: solo su comite) o 404. */
  private async convocatoriaConAlcance(usuarioId: string, rol: Rol, convocatoriaId: string): Promise<ConvocatoriaMinima> {
    const { data, error } = await supabaseAdmin.from('convocatoria').select('id, nombre, anio, semestre').eq('id', convocatoriaId).maybeSingle();
    if (error) fallo('No fue posible leer la convocatoria', error);
    if (!data) throw AppError.noEncontrado();
    if (rol === 'ADMINISTRADOR') return data as ConvocatoriaMinima;
    if (rol !== 'FUNCIONARIO') throw AppError.noEncontrado();
    if (!(await this.esDelComite(usuarioId, convocatoriaId))) throw AppError.noEncontrado();
    return data as ConvocatoriaMinima;
  }

  private async esDelComite(funcionarioId: string, convocatoriaId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
      .from('asignacion_funcionario')
      .select('id', { head: true, count: 'exact' })
      .eq('convocatoria_id', convocatoriaId)
      .eq('funcionario_id', funcionarioId)
      .is('retirado_en', null);
    if (error) fallo('No fue posible verificar el comite', error);
    return (count ?? 0) > 0;
  }

  // ------------------------------------------------------------------ solicitud

  async solicitarConsolidado(
    user: UsuarioAutenticado,
    ctx: ContextoAuditoria,
    convocatoriaId: string,
    entrada: SolicitarConsolidadoInput,
  ): Promise<{ http: 200 | 202; respuesta: SolicitudReporteRespuestaDto }> {
    const { formato, filtros: filtrosEntrada } = SolicitarConsolidadoInputSchema.parse(entrada);
    const convocatoria = await this.convocatoriaConAlcance(user.id, user.rol, convocatoriaId);
    const filtros = normalizarFiltros(filtrosEntrada);
    const sensibles = tienePermiso(user.rol, PERMISO_EXPORTAR_SENSIBLE);
    const tipo = TIPO_REPORTE_POR_FORMATO[formato];
    const huella = huellaParametros(user.id, tipo, convocatoriaId, filtros, sensibles);

    // Duplicado en curso: se informa antes de contar.
    const existente = await this.enCurso(huella);
    if (existente) throw AppError.conflicto('REPORTE_EN_CURSO', 'Ya existe una solicitud idéntica en curso. Espere a que termine.', { reporte_id: existente.id });

    const ids = await listarIdsExpedientes(convocatoriaId, filtros);
    const umbral = await configuracionService.getEntero('REPORTE_UMBRAL_SINCRONO', UMBRAL_SINCRONO_DEFECTO);
    const sincrono = ids.length <= umbral;

    const ahora = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('reporte_generado')
      .insert({
        usuario_id: user.id,
        tipo,
        convocatoria_id: convocatoriaId,
        parametros: { formato, filtros },
        huella_parametros: huella,
        estado: sincrono ? 'PROCESANDO' : 'COLA',
        incluye_sensibles: sensibles,
        filas_total: ids.length,
        intentos: sincrono ? 1 : 0,
        iniciado_en: sincrono ? ahora : null,
      })
      .select(COLUMNAS_REPORTE)
      .single();
    if (error) {
      if (error.code === '23505') {
        const dup = await this.enCurso(huella);
        throw AppError.conflicto('REPORTE_EN_CURSO', 'Ya existe una solicitud idéntica en curso. Espere a que termine.', dup ? { reporte_id: dup.id } : undefined);
      }
      fallo('No fue posible registrar el reporte', error);
    }
    let reporte = data as FilaConConvocatoria;

    await auditar({
      ...ctx,
      accion: 'EXPORTACION',
      entidad: 'REPORTE',
      entidad_id: reporte.id,
      metadatos: {
        fase: 'SOLICITUD',
        tipo,
        convocatoria_id: convocatoriaId,
        formato,
        filtros,
        filas_total: ids.length,
        sincrono,
        incluye_sensibles: sensibles,
      },
    });

    if (!sincrono) return { http: 202, respuesta: { reporte: aDto(reporte), sincrono: false } };

    try {
      reporte = await this.generarYAlmacenar(reporte, { id: user.id, rol: user.rol }, convocatoria, ids);
    } catch (e) {
      const codigo = e instanceof ErrorReporte ? e.codigo : ERRORES_REPORTE.ERROR_GENERACION;
      logger.error({ err: e, reporte_id: reporte.id }, 'Fallo la generacion sincrona del reporte');
      await this.marcarFallido(reporte.id, codigo);
      if (codigo === ERRORES_REPORTE.TAMANO_EXCEDIDO) {
        throw AppError.datosInvalidos('REPORTE_DEMASIADO_GRANDE', 'El consolidado es demasiado grande para el formato HTML. Solicítelo en formato CSV o aplique filtros.');
      }
      throw AppError.interno('No fue posible generar el reporte. Intente nuevamente.');
    }
    return { http: 200, respuesta: { reporte: aDto(reporte), sincrono: true } };
  }

  private async enCurso(huella: string): Promise<ReporteRow | null> {
    const { data, error } = await supabaseAdmin
      .from('reporte_generado')
      .select('*')
      .eq('huella_parametros', huella)
      .in('estado', ['COLA', 'PROCESANDO'])
      .limit(1)
      .maybeSingle();
    if (error) fallo('No fue posible consultar los reportes en curso', error);
    return (data as ReporteRow | null) ?? null;
  }

  // ------------------------------------------------------------------ generacion

  private async construirArchivo(
    reporte: ReporteRow,
    convocatoria: ConvocatoriaMinima,
    ids: string[],
    incluirSensibles: boolean,
    rolSolicitante: Rol,
  ): Promise<ArchivoGenerado> {
    const formato = reporte.tipo === 'CONSOLIDADO_CSV' ? 'CSV' : 'HTML';
    const filtros = (reporte.parametros?.filtros as FiltrosConsolidado | undefined) ?? {};
    const columnas = columnasPara(incluirSensibles);
    const { filas, resumen } = await cargarTodasLasFilas(convocatoria, ids, incluirSensibles);
    if (formato === 'CSV') {
      return { buffer: generarCsv(columnas, filas), contentType: 'text/csv; charset=utf-8', extension: 'csv' };
    }
    const criterios: CriterioFila[] = [
      { criterio: 'Convocatoria', valor: `${convocatoria.nombre} (${convocatoria.anio}-${convocatoria.semestre})` },
      { criterio: 'Expedientes incluidos', valor: String(filas.length) },
      { criterio: 'Estado', valor: filtros.estado ?? 'Todos (excepto borradores)' },
      { criterio: 'Tipo de trámite', valor: filtros.tipo_solicitud ? (TEXTO_TIPO_SOLICITUD[filtros.tipo_solicitud] ?? filtros.tipo_solicitud) : 'Todos' },
      { criterio: 'Beneficio', valor: filtros.beneficio ?? 'Todos' },
      { criterio: 'Fecha de envío desde', valor: filtros.desde ?? 'Sin límite' },
      { criterio: 'Fecha de envío hasta', valor: filtros.hasta ?? 'Sin límite' },
      { criterio: 'Incluye datos sensibles', valor: incluirSensibles ? 'Sí' : 'No' },
    ];
    const buffer = generarHtml(columnas, filas, resumen, criterios, {
      convocatoria: `${convocatoria.nombre} (${convocatoria.anio}-${convocatoria.semestre})`,
      generadoPorRol: ROL_TEXTO[rolSolicitante] ?? rolSolicitante,
      generadoEn: new Date(),
    });
    return { buffer, contentType: 'text/html; charset=utf-8', extension: 'html' };
  }

  /**
   * Genera el archivo, lo sube al bucket privado y deja el reporte LISTO. Reverifica el alcance del
   * solicitante (si fue desasignado, SIN_ALCANCE). Lanza ErrorReporte con codigo generico.
   */
  private async generarYAlmacenar(
    reporte: FilaConConvocatoria,
    solicitante: { id: string; rol: Rol },
    convocatoria: ConvocatoriaMinima,
    idsPrevios?: string[],
  ): Promise<FilaConConvocatoria> {
    if (solicitante.rol === 'FUNCIONARIO' && !(await this.esDelComite(solicitante.id, convocatoria.id))) {
      throw new ErrorReporte(ERRORES_REPORTE.SIN_ALCANCE, 'El solicitante ya no pertenece al comité de la convocatoria');
    }
    if (solicitante.rol !== 'FUNCIONARIO' && solicitante.rol !== 'ADMINISTRADOR') {
      throw new ErrorReporte(ERRORES_REPORTE.SIN_ALCANCE, 'El rol del solicitante no puede exportar');
    }
    const incluirSensibles = reporte.incluye_sensibles && tienePermiso(solicitante.rol, PERMISO_EXPORTAR_SENSIBLE);
    const filtros = (reporte.parametros?.filtros as FiltrosConsolidado | undefined) ?? {};
    const ids = idsPrevios ?? (await listarIdsExpedientes(convocatoria.id, filtros));

    let archivo: ArchivoGenerado;
    try {
      archivo = await this.construirArchivo(reporte, convocatoria, ids, incluirSensibles, solicitante.rol);
    } catch (e) {
      logger.error({ err: e, reporte_id: reporte.id }, 'No fue posible construir el archivo del reporte');
      if (e instanceof HtmlDemasiadoGrandeError) throw new ErrorReporte(ERRORES_REPORTE.TAMANO_EXCEDIDO, e.message);
      throw new ErrorReporte(ERRORES_REPORTE.ERROR_GENERACION, 'Fallo la construcción del archivo');
    }

    const clave = `${reporte.usuario_id}/${reporte.id}.${archivo.extension}`;
    const subida = await supabaseAdmin.storage.from(BUCKET_REPORTES).upload(clave, archivo.buffer, { contentType: archivo.contentType, upsert: true });
    if (subida.error) {
      logger.error({ err: subida.error, reporte_id: reporte.id }, 'No fue posible subir el reporte');
      throw new ErrorReporte(ERRORES_REPORTE.ERROR_ALMACENAMIENTO, 'Fallo la subida al almacenamiento');
    }

    const horas = await configuracionService.getEntero('REPORTE_RETENCION_HORAS', RETENCION_HORAS_DEFECTO);
    const ahora = new Date();
    const nombre =
      archivo.extension === 'html'
        ? nombreArchivoHtml(convocatoria.nombre, ahora)
        : `consolidado_FOEST-${convocatoria.anio}-${convocatoria.semestre}_${ahora.toISOString().slice(0, 10).replace(/-/g, '')}.${archivo.extension}`;
    const { data, error } = await supabaseAdmin
      .from('reporte_generado')
      .update({
        estado: 'LISTO',
        incluye_sensibles: incluirSensibles,
        filas_total: ids.length,
        storage_key: clave,
        nombre_archivo: nombre,
        sha256: crypto.createHash('sha256').update(archivo.buffer).digest('hex'),
        tamano_bytes: archivo.buffer.length,
        error: null,
        finalizado_en: ahora.toISOString(),
        expira_en: new Date(ahora.getTime() + horas * 3_600_000).toISOString(),
      })
      .eq('id', reporte.id)
      .select(COLUMNAS_REPORTE)
      .single();
    if (error) {
      await supabaseAdmin.storage.from(BUCKET_REPORTES).remove([clave]).catch(() => undefined);
      throw new ErrorReporte(ERRORES_REPORTE.ERROR_GENERACION, 'No se pudo registrar el resultado');
    }
    return data as FilaConConvocatoria;
  }

  async marcarFallido(id: string, codigo: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('reporte_generado')
      .update({ estado: 'FALLIDO', error: codigo, finalizado_en: new Date().toISOString() })
      .eq('id', id);
    if (error) logger.error({ err: error, reporte_id: id }, 'No fue posible marcar el reporte como fallido');
  }

  // ------------------------------------------------------------------ cola (job)

  /** Toma el reporte COLA mas antiguo con bloqueo optimista; null si no hay o lo tomo otra instancia. */
  async tomarSiguienteDeCola(): Promise<FilaConConvocatoria | null> {
    const { data: candidato, error } = await supabaseAdmin
      .from('reporte_generado')
      .select('id, intentos')
      .eq('estado', 'COLA')
      .order('creado_en', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) fallo('No fue posible consultar la cola de reportes', error);
    if (!candidato) return null;
    const { id, intentos } = candidato as { id: string; intentos: number };
    const { data, error: errUp } = await supabaseAdmin
      .from('reporte_generado')
      .update({ estado: 'PROCESANDO', iniciado_en: new Date().toISOString(), intentos: intentos + 1 })
      .eq('id', id)
      .eq('estado', 'COLA')
      .select(COLUMNAS_REPORTE);
    if (errUp) fallo('No fue posible tomar el reporte de la cola', errUp);
    const filas = (data ?? []) as FilaConConvocatoria[];
    return filas[0] ?? null;
  }

  /** Procesa un reporte ya tomado (PROCESANDO): LISTO + notificacion, reintento (COLA) o FALLIDO. */
  async procesarTomado(reporte: FilaConConvocatoria): Promise<'LISTO' | 'REINTENTO' | 'FALLIDO'> {
    try {
      const { data: usuario, error } = await supabaseAdmin.from('usuario').select('id, rol, activo').eq('id', reporte.usuario_id).maybeSingle();
      if (error) throw new Error(error.message);
      const u = usuario as { id: string; rol: Rol; activo: boolean } | null;
      if (!u || !u.activo || !reporte.convocatoria_id) throw new ErrorReporte(ERRORES_REPORTE.SIN_ALCANCE, 'Solicitante o convocatoria no disponibles');
      const { data: conv, error: errConv } = await supabaseAdmin.from('convocatoria').select('id, nombre, anio, semestre').eq('id', reporte.convocatoria_id).maybeSingle();
      if (errConv) throw new Error(errConv.message);
      if (!conv) throw new ErrorReporte(ERRORES_REPORTE.SIN_ALCANCE, 'La convocatoria ya no existe');
      const listo = await this.generarYAlmacenar(reporte, { id: u.id, rol: u.rol }, conv as ConvocatoriaMinima);
      await this.notificarListo(listo, u.rol);
      return 'LISTO';
    } catch (e) {
      const codigo = e instanceof ErrorReporte ? e.codigo : ERRORES_REPORTE.ERROR_GENERACION;
      logger.error({ err: e, reporte_id: reporte.id, codigo }, 'Fallo el procesamiento del reporte');
      if (codigo !== ERRORES_REPORTE.SIN_ALCANCE && codigo !== ERRORES_REPORTE.TAMANO_EXCEDIDO && reporte.intentos < MAX_INTENTOS) {
        await supabaseAdmin.from('reporte_generado').update({ estado: 'COLA', error: codigo }).eq('id', reporte.id).eq('estado', 'PROCESANDO');
        return 'REINTENTO';
      }
      await this.marcarFallido(reporte.id, codigo);
      await this.notificarFallido(reporte);
      return 'FALLIDO';
    }
  }

  private async notificarListo(reporte: FilaConConvocatoria, rol: Rol): Promise<void> {
    try {
      const horas = reporte.expira_en ? Math.max(1, Math.round((new Date(reporte.expira_en).getTime() - Date.now()) / 3_600_000)) : RETENCION_HORAS_DEFECTO;
      await encolarNotificacion({
        usuario_id: reporte.usuario_id,
        tipo: 'REPORTE_LISTO',
        titulo: 'Reporte listo',
        mensaje: `Su consolidado de la convocatoria ${reporte.convocatoria?.nombre ?? ''} está listo para descargar. Estará disponible durante ${horas} horas.`,
        entidad: 'REPORTE',
        entidad_id: reporte.id,
        url_destino: rol === 'ADMINISTRADOR' ? '/admin/reportes' : '/funcionario/reportes',
        clave_dedup: `REPORTE_LISTO:${reporte.id}`,
      });
      await supabaseAdmin.from('reporte_generado').update({ notificado_en: new Date().toISOString() }).eq('id', reporte.id);
    } catch (e) {
      logger.error({ err: e, reporte_id: reporte.id }, 'No fue posible notificar el reporte listo');
    }
  }

  private async notificarFallido(reporte: FilaConConvocatoria): Promise<void> {
    try {
      await encolarNotificacion({
        usuario_id: reporte.usuario_id,
        tipo: 'REPORTE_FALLIDO',
        titulo: 'No fue posible generar el reporte',
        mensaje: 'La generación de su reporte no se completó. Puede solicitarlo nuevamente; si el problema persiste, contacte al administrador.',
        entidad: 'REPORTE',
        entidad_id: reporte.id,
        url_destino: '/admin/reportes',
        clave_dedup: `REPORTE_FALLIDO:${reporte.id}`,
        canal: 'APP',
      });
    } catch (e) {
      logger.warn({ err: e, reporte_id: reporte.id }, 'No fue posible notificar el reporte fallido');
    }
  }

  /** Vencidos: borra el objeto y deja el reporte EXPIRADO. PROCESANDO por mas de 15 minutos: FALLIDO/TIMEOUT. */
  async purgarVencidos(): Promise<{ purgados: number; atascados: number }> {
    const ahora = new Date();
    const { data, error } = await supabaseAdmin
      .from('reporte_generado')
      .select('id, storage_key')
      .eq('estado', 'LISTO')
      .lt('expira_en', ahora.toISOString())
      .limit(200);
    if (error) fallo('No fue posible listar los reportes vencidos', error);
    let purgados = 0;
    for (const r of (data ?? []) as Array<{ id: string; storage_key: string | null }>) {
      if (r.storage_key) {
        const { error: errRm } = await supabaseAdmin.storage.from(BUCKET_REPORTES).remove([r.storage_key]);
        if (errRm) {
          logger.error({ err: errRm, reporte_id: r.id }, 'No fue posible borrar el archivo vencido');
          continue;
        }
      }
      const { error: errUp } = await supabaseAdmin.from('reporte_generado').update({ estado: 'EXPIRADO' }).eq('id', r.id).eq('estado', 'LISTO');
      if (!errUp) purgados += 1;
    }

    const limite = new Date(ahora.getTime() - 15 * 60_000).toISOString();
    const { data: atascadosData, error: errAt } = await supabaseAdmin
      .from('reporte_generado')
      .update({ estado: 'FALLIDO', error: ERRORES_REPORTE.TIMEOUT, finalizado_en: ahora.toISOString() })
      .eq('estado', 'PROCESANDO')
      .lt('iniciado_en', limite)
      .select('id');
    if (errAt) logger.error({ err: errAt }, 'No fue posible revisar reportes atascados');
    return { purgados, atascados: (atascadosData ?? []).length };
  }

  // ------------------------------------------------------------------ consultas

  private async propio(user: UsuarioAutenticado, id: string): Promise<FilaConConvocatoria> {
    const { data, error } = await supabaseAdmin.from('reporte_generado').select(COLUMNAS_REPORTE).eq('id', id).maybeSingle();
    if (error) fallo('No fue posible leer el reporte', error);
    const fila = data as FilaConConvocatoria | null;
    if (!fila || fila.usuario_id !== user.id) throw AppError.noEncontrado();
    return fila;
  }

  async obtener(user: UsuarioAutenticado, id: string): Promise<ReporteDto> {
    return aDto(await this.propio(user, id));
  }

  async listarMios(user: UsuarioAutenticado, query: MisReportesQuery): Promise<Paginado<ReporteDto>> {
    const desde = (query.page - 1) * query.page_size;
    let q = supabaseAdmin.from('reporte_generado').select(COLUMNAS_REPORTE, { count: 'exact' }).eq('usuario_id', user.id);
    if (query.estado) q = q.eq('estado', query.estado);
    if (query.tipo) q = q.eq('tipo', query.tipo);
    const { data, error, count } = await q.order('creado_en', { ascending: false }).range(desde, desde + query.page_size - 1);
    if (error) fallo('No fue posible listar los reportes', error);
    return {
      data: ((data ?? []) as FilaConConvocatoria[]).map(aDto),
      page: query.page,
      page_size: query.page_size,
      total: count ?? 0,
    };
  }

  async descarga(user: UsuarioAutenticado, ctx: ContextoAuditoria, id: string): Promise<DescargaReporteDto> {
    const r = await this.propio(user, id);
    const vencido = r.estado === 'LISTO' && r.expira_en !== null && new Date(r.expira_en).getTime() <= Date.now();
    if (r.estado === 'EXPIRADO' || vencido) throw new AppError(410, 'REPORTE_EXPIRADO', 'El reporte ya expiró. Solicite uno nuevo.');
    if (r.estado !== 'LISTO' || !r.storage_key) throw AppError.conflicto('REPORTE_NO_LISTO', 'El reporte aún no está listo para descargar.');

    // Reportes historicos (CONSOLIDADO_XLSX) conservan su nombre y extension .xlsx; no se regeneran.
    const nombre = r.nombre_archivo ?? `reporte.${extensionLegada(r.tipo)}`;
    // `download` fuerza Content-Disposition: attachment: el HTML nunca se renderiza en el dominio de Supabase.
    const firmada = await supabaseAdmin.storage.from(BUCKET_REPORTES).createSignedUrl(r.storage_key, SEGUNDOS_URL_DESCARGA, { download: nombre });
    if (firmada.error || !firmada.data?.signedUrl) {
      if (firmada.error && /not found|does not exist/i.test(firmada.error.message)) throw new AppError(410, 'REPORTE_EXPIRADO', 'El reporte ya expiró. Solicite uno nuevo.');
      fallo('No fue posible firmar la descarga', firmada.error);
    }

    await auditar({
      ...ctx,
      accion: 'EXPORTACION',
      entidad: 'REPORTE',
      entidad_id: r.id,
      metadatos: {
        fase: 'DESCARGA',
        tipo: r.tipo,
        convocatoria_id: r.convocatoria_id,
        filtros: descripcionFiltros((r.parametros?.filtros as FiltrosConsolidado | undefined) ?? {}),
        parametros: r.parametros,
        filas_total: r.filas_total,
        sha256_archivo: r.sha256,
        incluye_sensibles: r.incluye_sensibles,
      },
    });
    return {
      url: (firmada.data as { signedUrl: string }).signedUrl,
      expira_en: new Date(Date.now() + SEGUNDOS_URL_DESCARGA * 1000).toISOString(),
      nombre_archivo: nombre,
    };
  }
}

export const exportReportsService = new ExportReportsService();
