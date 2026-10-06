import type { Paginado } from '@foest/shared';
import { AppError, auditar, paginar, rangoSupabase, supabaseAsUser, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import type { AuditoriaListarQuery } from './admin_dashboard.dto';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA, type AuditoriaEventoItem } from './admin_dashboard.types';

/**
 * Consulta minima de la bitacora (auditoria.md) implementada en este lote.
 * Solo lectura (la tabla es append-only). Reglas:
 *  - Rango maximo de 366 dias por consulta (422 RANGO_EXCESIVO).
 *  - `desde`/`hasta` se interpretan en America/Bogota con cierre inclusivo del dia.
 *  - La consulta se audita como LECTURA_SENSIBLE sobre AUDITORIA solo en el detalle
 *    de un evento, en la linea de tiempo de una entidad y cuando se filtra por actor;
 *    las listas simples no se auditan (evita ruido recursivo). El evento que se
 *    inserta no vuelve a consultar la bitacora, por lo que no hay recursion.
 */
const DIA_MS = 86_400_000;
const RANGO_MAX_DIAS = 366;
const OFFSET_BOGOTA = '-05:00';

function inicioDiaBogota(fecha: string): string {
  return new Date(`${fecha}T00:00:00${OFFSET_BOGOTA}`).toISOString();
}
function finDiaBogotaExclusivo(fecha: string): string {
  return new Date(new Date(`${fecha}T00:00:00${OFFSET_BOGOTA}`).getTime() + DIA_MS).toISOString();
}

export const auditoriaService = {
  catalogo(): { acciones: readonly string[]; entidades: readonly string[]; resultados: readonly string[] } {
    return { acciones: ACCIONES_AUDITORIA, entidades: ENTIDADES_AUDITORIA, resultados: ['EXITO', 'FALLO', 'DENEGADO'] };
  },

  async listar(user: UsuarioAutenticado, query: AuditoriaListarQuery, contexto: Partial<EventoAuditoria>): Promise<Paginado<AuditoriaEventoItem>> {
    if (query.desde && query.hasta) {
      const dias = (Date.parse(query.hasta) - Date.parse(query.desde)) / DIA_MS;
      if (dias < 0) throw AppError.datosInvalidos('RANGO_INVALIDO', 'La fecha "hasta" debe ser posterior a "desde"');
      if (dias > RANGO_MAX_DIAS) throw AppError.datosInvalidos('RANGO_EXCESIVO', `El rango maximo de consulta es de ${RANGO_MAX_DIAS} dias`);
    }
    const db = supabaseAsUser(user.token);
    const { desde, hasta } = rangoSupabase(query);
    let q = db.from('auditoria_evento').select('*', { count: 'exact' }).order('registrado_en', { ascending: false }).order('secuencia', { ascending: false });
    if (query.actor_id) q = q.eq('actor_id', query.actor_id);
    if (query.entidad) q = q.eq('entidad', query.entidad);
    if (query.entidad_id) q = q.eq('entidad_id', query.entidad_id);
    if (query.accion) q = q.eq('accion', query.accion);
    if (query.resultado) q = q.eq('resultado', query.resultado);
    if (query.request_id) q = q.eq('request_id', query.request_id);
    if (query.desde) q = q.gte('registrado_en', inicioDiaBogota(query.desde));
    if (query.hasta) q = q.lt('registrado_en', finDiaBogotaExclusivo(query.hasta));
    const { data, error, count } = await q.range(desde, hasta);
    if (error) throw AppError.interno(`No fue posible consultar la bitacora: ${error.message}`);

    if (query.actor_id) {
      await auditar({
        ...contexto,
        accion: 'LECTURA_SENSIBLE',
        entidad: 'AUDITORIA',
        entidad_id: null,
        metadatos: { consulta: 'listar_por_actor', actor_consultado: query.actor_id, filtros: query, filas: data?.length ?? 0 },
      });
    }
    return paginar((data ?? []) as AuditoriaEventoItem[], query, count ?? 0);
  },

  async detalle(user: UsuarioAutenticado, id: string, contexto: Partial<EventoAuditoria>): Promise<AuditoriaEventoItem> {
    const db = supabaseAsUser(user.token);
    const { data, error } = await db.from('auditoria_evento').select('*').eq('id', id).maybeSingle();
    if (error) throw AppError.interno(`No fue posible consultar el evento: ${error.message}`);
    if (!data) throw AppError.noEncontrado('EVENTO_NO_ENCONTRADO', 'El evento de auditoria no existe');
    const evento = data as AuditoriaEventoItem;
    await auditar({
      ...contexto,
      accion: 'LECTURA_SENSIBLE',
      entidad: 'AUDITORIA',
      entidad_id: evento.id,
      metadatos: { consulta: 'detalle', evento_entidad: evento.entidad, evento_actor_id: evento.actor_id },
    });
    return evento;
  },

  async porEntidad(user: UsuarioAutenticado, entidad: string, entidadId: string, contexto: Partial<EventoAuditoria>): Promise<{ data: AuditoriaEventoItem[]; total: number }> {
    const db = supabaseAsUser(user.token);
    const { data, error, count } = await db
      .from('auditoria_evento')
      .select('*', { count: 'exact' })
      .eq('entidad', entidad)
      .eq('entidad_id', entidadId)
      .order('registrado_en', { ascending: true })
      .limit(500);
    if (error) throw AppError.interno(`No fue posible consultar la linea de tiempo: ${error.message}`);
    await auditar({
      ...contexto,
      accion: 'LECTURA_SENSIBLE',
      entidad: 'AUDITORIA',
      entidad_id: null,
      metadatos: { consulta: 'linea_tiempo', entidad, entidad_id: entidadId, filas: data?.length ?? 0 },
    });
    return { data: (data ?? []) as AuditoriaEventoItem[], total: count ?? 0 };
  },
};
