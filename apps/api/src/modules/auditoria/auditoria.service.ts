import {
  ACCIONES_AUDITORIA,
  ENTIDADES_AUDITORIA,
  EXPORTACION_MAX_FILAS_AUDITORIA,
  RANGO_MAX_DIAS_AUDITORIA,
  RESULTADOS_AUDITORIA,
  type AuditoriaFiltros,
  type CatalogoAuditoria,
  type EstadoIntegridadAuditoria,
  type LineaTiempoAuditoria,
  type OrigenVerificacionAuditoria,
  type Paginado,
} from '@foest/shared';
import { AppError, auditar, logger, paginar, rangoSupabase, supabaseAdmin, supabaseAsUser, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { generarCsv } from './auditoria.csv';
import type { AuditoriaExportarQuery, AuditoriaListarQuery } from './auditoria.dto';
import type { AuditoriaEventoRow, AuditoriaIntegridadRow, CandidatosRetencionRpc, ExportacionAuditoria, ResumenIntegridadRpc } from './auditoria.types';

/**
 * Consulta de la bitacora (auditoria.md). Solo lectura: la tabla es append-only.
 *  - Rango maximo de 366 dias por consulta (422 RANGO_EXCESIVO).
 *  - `desde`/`hasta` en America/Bogota con cierre inclusivo del dia.
 *  - La consulta se audita como LECTURA_SENSIBLE sobre AUDITORIA solo en el detalle,
 *    en la linea de tiempo y cuando se filtra por actor; las listas simples no se
 *    auditan (evita ruido recursivo: el evento insertado no vuelve a consultar).
 *  - La exportacion exige permiso `auditoria:exportar` y motivo, y registra EXPORTACION.
 *  - Lecturas con el token del usuario (RLS: solo administrador); escrituras de
 *    sistema (verificaciones, notificaciones) con service_role.
 */
const DIA_MS = 86_400_000;
const OFFSET_BOGOTA = '-05:00';
const LOTE_EXPORTACION = 1000;
const LIMITE_LINEA_TIEMPO = 500;

/** Subconjunto del builder de supabase-js necesario para aplicar los filtros (sus metodos devuelven `this`). */
interface FiltroAplicable {
  eq(columna: string, valor: string): this;
  gte(columna: string, valor: string): this;
  lt(columna: string, valor: string): this;
}

function inicioDiaBogota(fecha: string): string {
  return new Date(`${fecha}T00:00:00${OFFSET_BOGOTA}`).toISOString();
}
function finDiaBogotaExclusivo(fecha: string): string {
  return new Date(new Date(`${fecha}T00:00:00${OFFSET_BOGOTA}`).getTime() + DIA_MS).toISOString();
}

export function validarRango(filtros: Pick<AuditoriaFiltros, 'desde' | 'hasta'>): void {
  if (!filtros.desde || !filtros.hasta) return;
  const dias = (Date.parse(filtros.hasta) - Date.parse(filtros.desde)) / DIA_MS;
  if (dias < 0) throw AppError.datosInvalidos('RANGO_INVALIDO', 'La fecha "hasta" debe ser posterior a "desde"');
  if (dias > RANGO_MAX_DIAS_AUDITORIA) {
    throw AppError.datosInvalidos('RANGO_EXCESIVO', `El rango maximo de consulta es de ${RANGO_MAX_DIAS_AUDITORIA} dias`);
  }
}

/** Aplica los filtros sobre el builder (muta y devuelve this); no usa genericos para evitar instanciaciones profundas. */
function aplicarFiltros(q: FiltroAplicable, f: AuditoriaFiltros): void {
  let r = q;
  if (f.actor_id) r = r.eq('actor_id', f.actor_id);
  if (f.entidad) r = r.eq('entidad', f.entidad);
  if (f.entidad_id) r = r.eq('entidad_id', f.entidad_id);
  if (f.accion) r = r.eq('accion', f.accion);
  if (f.resultado) r = r.eq('resultado', f.resultado);
  if (f.request_id) r = r.eq('request_id', f.request_id);
  if (f.desde) r = r.gte('registrado_en', inicioDiaBogota(f.desde));
  if (f.hasta) r = r.lt('registrado_en', finDiaBogotaExclusivo(f.hasta));
  void r;
}

function soloFiltros(q: AuditoriaFiltros): AuditoriaFiltros {
  const { actor_id, entidad, entidad_id, accion, resultado, request_id, desde, hasta } = q;
  const f: AuditoriaFiltros = { actor_id, entidad, entidad_id, accion, resultado, request_id, desde, hasta };
  for (const k of Object.keys(f) as Array<keyof AuditoriaFiltros>) if (f[k] === undefined) delete f[k];
  return f;
}

async function notificarAdministradores(n: {
  tipo: string;
  titulo: string;
  mensaje: string;
  entidad_id: string | null;
  severidad: 'INFO' | 'ADVERTENCIA' | 'CRITICA';
  clave_dedup: string;
}): Promise<number> {
  const { data: admins, error } = await supabaseAdmin.from('usuario').select('id').eq('rol', 'ADMINISTRADOR').eq('activo', true);
  if (error) {
    logger.warn({ err: error }, 'No fue posible listar administradores para notificar');
    return 0;
  }
  let enviadas = 0;
  for (const a of (admins ?? []) as Array<{ id: string }>) {
    const { error: errN } = await supabaseAdmin.from('notificacion').insert({
      usuario_id: a.id,
      tipo: n.tipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      entidad: 'AUDITORIA',
      entidad_id: n.entidad_id,
      url_destino: '/admin/auditoria',
      severidad: n.severidad,
      clave_dedup: n.clave_dedup,
    });
    if (!errN) enviadas += 1;
    else if ((errN as { code?: string }).code !== '23505') logger.warn({ err: errN, usuario: a.id }, 'No fue posible crear la notificacion de auditoria');
  }
  return enviadas;
}

export const auditoriaService = {
  catalogo(): CatalogoAuditoria {
    return { acciones: ACCIONES_AUDITORIA, entidades: ENTIDADES_AUDITORIA, resultados: RESULTADOS_AUDITORIA };
  },

  async listar(user: UsuarioAutenticado, query: AuditoriaListarQuery, contexto: Partial<EventoAuditoria>): Promise<Paginado<AuditoriaEventoRow>> {
    validarRango(query);
    const db = supabaseAsUser(user.token);
    const { desde, hasta } = rangoSupabase(query);
    const q = db.from('auditoria_evento').select('*', { count: 'exact' });
    aplicarFiltros(q as unknown as FiltroAplicable, query);
    const { data, error, count } = await q.order('registrado_en', { ascending: false }).order('secuencia', { ascending: false }).range(desde, hasta);
    if (error) throw AppError.interno(`No fue posible consultar la bitacora: ${error.message}`);

    if (query.actor_id) {
      await auditar({
        ...contexto,
        accion: 'LECTURA_SENSIBLE',
        entidad: 'AUDITORIA',
        entidad_id: null,
        metadatos: { consulta: 'listar_por_actor', actor_consultado: query.actor_id, filtros: soloFiltros(query), filas: data?.length ?? 0 },
      });
    }
    return paginar((data ?? []) as AuditoriaEventoRow[], query, count ?? 0);
  },

  async detalle(user: UsuarioAutenticado, id: string, contexto: Partial<EventoAuditoria>): Promise<AuditoriaEventoRow> {
    const db = supabaseAsUser(user.token);
    const { data, error } = await db.from('auditoria_evento').select('*').eq('id', id).maybeSingle();
    if (error) throw AppError.interno(`No fue posible consultar el evento: ${error.message}`);
    if (!data) throw AppError.noEncontrado('EVENTO_NO_ENCONTRADO', 'El evento de auditoria no existe');
    const evento = data as AuditoriaEventoRow;
    await auditar({
      ...contexto,
      accion: 'LECTURA_SENSIBLE',
      entidad: 'AUDITORIA',
      entidad_id: evento.id,
      metadatos: { consulta: 'detalle', evento_entidad: evento.entidad, evento_actor_id: evento.actor_id },
    });
    return evento;
  },

  async porEntidad(user: UsuarioAutenticado, entidad: string, entidadId: string, contexto: Partial<EventoAuditoria>): Promise<LineaTiempoAuditoria> {
    const db = supabaseAsUser(user.token);
    const { data, error, count } = await db
      .from('auditoria_evento')
      .select('*', { count: 'exact' })
      .eq('entidad', entidad)
      .eq('entidad_id', entidadId)
      .order('registrado_en', { ascending: true })
      .order('secuencia', { ascending: true })
      .limit(LIMITE_LINEA_TIEMPO);
    if (error) throw AppError.interno(`No fue posible consultar la linea de tiempo: ${error.message}`);
    await auditar({
      ...contexto,
      accion: 'LECTURA_SENSIBLE',
      entidad: 'AUDITORIA',
      entidad_id: null,
      metadatos: { consulta: 'linea_tiempo', entidad, entidad_id: entidadId, filas: data?.length ?? 0 },
    });
    return { data: (data ?? []) as AuditoriaEventoRow[], total: count ?? 0 };
  },

  /**
   * Exportacion auditada (sincrona: el .md la delega al mecanismo asincrono de
   * export_reports, que no existe aun; ver "Dependencias pendientes"). Se limita a
   * EXPORTACION_MAX_FILAS_AUDITORIA filas para obligar a acotar los filtros.
   */
  async exportar(user: UsuarioAutenticado, query: AuditoriaExportarQuery, contexto: Partial<EventoAuditoria>): Promise<ExportacionAuditoria> {
    validarRango(query);
    const filtros = soloFiltros(query);
    const db = supabaseAsUser(user.token);

    const conteo = db.from('auditoria_evento').select('id', { count: 'exact', head: true });
    aplicarFiltros(conteo as unknown as FiltroAplicable, filtros);
    const { count, error: errCount } = await conteo;
    if (errCount) throw AppError.interno(`No fue posible contar los eventos a exportar: ${errCount.message}`);
    const total = count ?? 0;
    if (total > EXPORTACION_MAX_FILAS_AUDITORIA) {
      throw AppError.datosInvalidos('EXPORTACION_EXCESIVA', `La exportacion supera el maximo de ${EXPORTACION_MAX_FILAS_AUDITORIA} filas; acote los filtros`, {
        total,
        maximo: EXPORTACION_MAX_FILAS_AUDITORIA,
      });
    }

    const eventos: AuditoriaEventoRow[] = [];
    for (let desde = 0; desde < total; desde += LOTE_EXPORTACION) {
      const lectura = db.from('auditoria_evento').select('*');
      aplicarFiltros(lectura as unknown as FiltroAplicable, filtros);
      const { data, error } = await lectura.order('secuencia', { ascending: true }).range(desde, desde + LOTE_EXPORTACION - 1);
      if (error) throw AppError.interno(`No fue posible leer los eventos a exportar: ${error.message}`);
      const lote = (data ?? []) as AuditoriaEventoRow[];
      eventos.push(...lote);
      if (lote.length < LOTE_EXPORTACION) break;
    }

    // Si la auditoria de la exportacion falla, la exportacion no se entrega.
    const eventoId = await auditar({
      ...contexto,
      accion: 'EXPORTACION',
      entidad: 'AUDITORIA',
      entidad_id: null,
      metadatos: { formato: query.formato, motivo: query.motivo, filtros, filas: eventos.length, total },
    });

    const marca = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      nombre_archivo: `auditoria_${marca}_${eventoId.slice(0, 8)}.csv`,
      tipo_contenido: 'text/csv; charset=utf-8',
      contenido: generarCsv(eventos),
      filas: eventos.length,
    };
  },

  /** Estado de la cadena de hashes: ultima verificacion, historial y cola. */
  async integridad(user: UsuarioAutenticado): Promise<EstadoIntegridadAuditoria> {
    const db = supabaseAsUser(user.token);
    const { data, error } = await db.from('auditoria_integridad').select('*').order('verificada_en', { ascending: false }).limit(10);
    if (error) throw AppError.interno(`No fue posible consultar las verificaciones de integridad: ${error.message}`);
    const historial = (data ?? []) as AuditoriaIntegridadRow[];

    let resumen: ResumenIntegridadRpc = { secuencia_actual: null, pendientes_verificacion: 0, cola: { encolados: 0, fallidos: 0 } };
    const rpc = await supabaseAdmin.rpc('fn_auditoria_resumen_integridad');
    if (rpc.error) logger.warn({ err: rpc.error }, 'fn_auditoria_resumen_integridad no disponible (migracion 0011 pendiente)');
    else if (rpc.data) resumen = rpc.data as ResumenIntegridadRpc;

    return {
      ultima: historial.find((h) => h.origen !== 'PURGA') ?? null,
      secuencia_actual: resumen.secuencia_actual,
      pendientes_verificacion: resumen.pendientes_verificacion,
      historial,
      cola: resumen.cola,
    };
  },

  /**
   * Verifica la cadena (RPC SECURITY DEFINER). Con `completa=false` reanuda desde la
   * ultima secuencia verificada (que se re-verifica como ancla). Una ruptura genera
   * notificacion CRITICA a los administradores.
   */
  async verificarIntegridad(opciones: { completa?: boolean; origen?: OrigenVerificacionAuditoria } = {}): Promise<AuditoriaIntegridadRow> {
    let desde: number | null = null;
    if (!opciones.completa) {
      const { data } = await supabaseAdmin
        .from('auditoria_integridad')
        .select('secuencia_hasta')
        .neq('origen', 'PURGA')
        .order('verificada_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      desde = (data as { secuencia_hasta: number | null } | null)?.secuencia_hasta ?? null;
    }
    const { data, error } = await supabaseAdmin.rpc('fn_auditoria_verificar_integridad', {
      p_desde: desde,
      p_hasta: null,
      p_origen: opciones.origen ?? 'JOB',
    });
    if (error || !data) throw new Error(`No fue posible verificar la integridad de la bitacora: ${error?.message ?? 'sin datos'}`);
    const fila = data as AuditoriaIntegridadRow;
    if (!fila.valida) {
      logger.error({ integridad: fila }, 'RUPTURA de la cadena de hashes de auditoria');
      await notificarAdministradores({
        tipo: 'AUDITORIA_INTEGRIDAD_ROTA',
        titulo: 'Ruptura de la cadena de integridad de la auditoria',
        mensaje: `La verificacion detecto una ruptura en la secuencia ${fila.primera_secuencia_rota ?? '?'}: ${fila.detalle ?? 'sin detalle'}. Revise la bitacora y preserve la evidencia.`,
        entidad_id: fila.id,
        severidad: 'CRITICA',
        clave_dedup: `AUDITORIA_INTEGRIDAD_ROTA:${fila.id}`,
      });
    }
    return fila;
  },

  /**
   * Retencion (RETENCION_AUDITORIA_ANIOS): el job NO borra. Informa al administrador
   * cuantos eventos superan la retencion para que la purga se ejecute manualmente con
   * `fn_auditoria_purgar_retencion(true)` desde el rol de mantenimiento (editor SQL).
   */
  async revisarRetencion(): Promise<CandidatosRetencionRpc | null> {
    const { data, error } = await supabaseAdmin.rpc('fn_auditoria_candidatos_retencion');
    if (error || !data) {
      logger.warn({ err: error }, 'No fue posible calcular los candidatos a purga por retencion');
      return null;
    }
    const r = data as CandidatosRetencionRpc;
    if (r.candidatos > 0) {
      const periodo = new Date().toISOString().slice(0, 7);
      await notificarAdministradores({
        tipo: 'AUDITORIA_RETENCION_PENDIENTE',
        titulo: 'Eventos de auditoria fuera del plazo de retencion',
        mensaje: `${r.candidatos} eventos de auditoria superan la retencion de ${r.retencion_anios} anios (anteriores a ${r.limite.slice(0, 10)}). La purga debe ejecutarla el rol de mantenimiento con fn_auditoria_purgar_retencion(true) tras exportar la particion al almacenamiento frio.`,
        entidad_id: null,
        severidad: 'ADVERTENCIA',
        clave_dedup: `AUDITORIA_RETENCION_PENDIENTE:${periodo}`,
      });
    }
    return r;
  },
};
