import type { Paginado } from '@foest/shared';
import { AppError, paginar, rangoSupabase, supabaseAsUser, type UsuarioAutenticado } from '../../shared';
import type { NotificacionesQuery } from './beneficiario_dashboard.dto';
import type { FilaNotificacion } from './beneficiario_dashboard.types';
import { textoFechaHora } from './supabase.util';

/**
 * Buzon in-app para CUALQUIER rol (DECISIONES seccion 13; contrato de notificaciones.md).
 * Se construye en este modulo porque `notificaciones` no esta en este lote; cuando exista,
 * puede absorber estos endpoints sin cambiar el contrato.
 *
 * Todas las lecturas y escrituras van con `supabaseAsUser(token)`: la politica
 * `notificacion_select_propia` / `notificacion_update_propia` de 0001_base.sql limita
 * a las propias; ademas se filtra explicitamente por `usuario_id`.
 */

export interface NotificacionDto extends FilaNotificacion {
  creada_en_texto: string;
}

const COLS = 'id, usuario_id, tipo, titulo, mensaje, entidad, entidad_id, url_destino, severidad, leida, leida_en, creada_en';

function presentar(n: FilaNotificacion): NotificacionDto {
  return { ...n, creada_en_texto: textoFechaHora(n.creada_en) ?? n.creada_en };
}

export const notificacionesService = {
  async listar(user: UsuarioAutenticado, query: NotificacionesQuery): Promise<Paginado<NotificacionDto>> {
    const db = supabaseAsUser(user.token);
    const { desde, hasta } = rangoSupabase(query);
    let q = db.from('notificacion').select(COLS, { count: 'exact' }).eq('usuario_id', user.id);
    if (query.leida !== undefined) q = q.eq('leida', query.leida);
    if (query.tipo) q = q.eq('tipo', query.tipo);
    if (query.severidad) q = q.eq('severidad', query.severidad);
    const { data, error, count } = await q.order('creada_en', { ascending: false }).range(desde, hasta);
    if (error) throw AppError.interno(`No fue posible consultar las notificaciones: ${error.message}`);
    return paginar(((data ?? []) as FilaNotificacion[]).map(presentar), query, count ?? 0);
  },

  async contadorNoLeidas(user: UsuarioAutenticado): Promise<{ no_leidas: number; criticas_no_leidas: number }> {
    const db = supabaseAsUser(user.token);
    const base = () => db.from('notificacion').select('id', { count: 'exact', head: true }).eq('usuario_id', user.id).eq('leida', false);
    const [todas, criticas] = await Promise.all([base(), base().eq('severidad', 'CRITICA')]);
    if (todas.error) throw AppError.interno(`No fue posible contar las notificaciones: ${todas.error.message}`);
    if (criticas.error) throw AppError.interno(`No fue posible contar las notificaciones criticas: ${criticas.error.message}`);
    return { no_leidas: todas.count ?? 0, criticas_no_leidas: criticas.count ?? 0 };
  },

  /** Idempotente: marcar una ya leida no cambia nada y responde 200. Ajena o inexistente -> 404. */
  async marcarLeida(user: UsuarioAutenticado, id: string): Promise<NotificacionDto> {
    const db = supabaseAsUser(user.token);
    const { data: actual, error: errLeer } = await db.from('notificacion').select(COLS).eq('id', id).eq('usuario_id', user.id).maybeSingle();
    if (errLeer) throw AppError.interno(`No fue posible consultar la notificacion: ${errLeer.message}`);
    const fila = actual as FilaNotificacion | null;
    if (!fila || fila.usuario_id !== user.id) throw AppError.noEncontrado();
    if (fila.leida) return presentar(fila);

    const leida_en = new Date().toISOString();
    const { data, error } = await db.from('notificacion').update({ leida: true, leida_en }).eq('id', id).eq('usuario_id', user.id).select(COLS).maybeSingle();
    if (error) throw AppError.interno(`No fue posible marcar la notificacion: ${error.message}`);
    const actualizada = (data as FilaNotificacion | null) ?? { ...fila, leida: true, leida_en };
    return presentar(actualizada);
  },

  /** Marca todas las no leidas del usuario; devuelve la cantidad afectada. */
  async leerTodas(user: UsuarioAutenticado): Promise<{ afectadas: number }> {
    const db = supabaseAsUser(user.token);
    const leida_en = new Date().toISOString();
    const { data, error } = await db.from('notificacion').update({ leida: true, leida_en }).eq('usuario_id', user.id).eq('leida', false).select('id');
    if (error) throw AppError.interno(`No fue posible marcar las notificaciones: ${error.message}`);
    return { afectadas: (data ?? []).length };
  },
};
