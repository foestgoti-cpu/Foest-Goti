import type { ContadorNotificacionesDTO, NotificacionDTO, Paginado, PreferenciasNotificacionDTO } from '@foest/shared';
import { AppError, auditar, paginar, rangoSupabase, supabaseAsUser, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import type { NotificacionesQuery, PreferenciasNotificacionInput } from './notificaciones.dto';
import type { FilaNotificacion, FilaPreferencia } from './notificaciones.types';
import { textoFechaHora } from './notificaciones.fechas';

/**
 * Buzon in-app para CUALQUIER rol (contrato vigente consumido por la campana y la pagina
 * del beneficiario) y preferencias minimas.
 *
 * Todas las lecturas y escrituras van con `supabaseAsUser(token)`: las politicas
 * `notificacion_select_propia` / `notificacion_update_propia` (0001) y
 * `preferencia_notificacion_*` (0012) limitan a lo propio; ademas se filtra por `usuario_id`.
 */

const COLS = 'id, usuario_id, tipo, titulo, mensaje, entidad, entidad_id, url_destino, severidad, leida, leida_en, creada_en';

function presentar(n: FilaNotificacion): NotificacionDTO {
  return { ...n, creada_en_texto: textoFechaHora(n.creada_en) ?? n.creada_en };
}

function preferenciasPorDefecto(usuarioId: string): PreferenciasNotificacionDTO {
  return { usuario_id: usuarioId, correo_recordatorios: true, correo_informativos: true, actualizado_en: null };
}

export const notificacionesService = {
  async listar(user: UsuarioAutenticado, query: NotificacionesQuery): Promise<Paginado<NotificacionDTO>> {
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

  async contadorNoLeidas(user: UsuarioAutenticado): Promise<ContadorNotificacionesDTO> {
    const db = supabaseAsUser(user.token);
    const base = () => db.from('notificacion').select('id', { count: 'exact', head: true }).eq('usuario_id', user.id).eq('leida', false);
    const [todas, criticas] = await Promise.all([base(), base().eq('severidad', 'CRITICA')]);
    if (todas.error) throw AppError.interno(`No fue posible contar las notificaciones: ${todas.error.message}`);
    if (criticas.error) throw AppError.interno(`No fue posible contar las notificaciones criticas: ${criticas.error.message}`);
    return { no_leidas: todas.count ?? 0, criticas_no_leidas: criticas.count ?? 0 };
  },

  /** Idempotente: marcar una ya leida no cambia nada y responde 200. Ajena o inexistente -> 404. */
  async marcarLeida(user: UsuarioAutenticado, id: string): Promise<NotificacionDTO> {
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

  /** Preferencias del usuario; si no tiene fila, devuelve los valores por defecto (todo activo). */
  async preferencias(user: UsuarioAutenticado): Promise<PreferenciasNotificacionDTO> {
    const db = supabaseAsUser(user.token);
    const { data, error } = await db
      .from('preferencia_notificacion')
      .select('usuario_id, correo_recordatorios, correo_informativos, actualizado_en')
      .eq('usuario_id', user.id)
      .maybeSingle();
    if (error) throw AppError.interno(`No fue posible consultar las preferencias: ${error.message}`);
    const fila = data as FilaPreferencia | null;
    return fila ?? preferenciasPorDefecto(user.id);
  },

  /** Crea o actualiza las preferencias (auditado: ACTUALIZAR / NOTIFICACION). */
  async actualizarPreferencias(
    user: UsuarioAutenticado,
    input: PreferenciasNotificacionInput,
    ctx: Partial<EventoAuditoria>,
  ): Promise<PreferenciasNotificacionDTO> {
    const antes = await this.preferencias(user);
    const db = supabaseAsUser(user.token);
    const { data, error } = await db
      .from('preferencia_notificacion')
      .upsert({ usuario_id: user.id, correo_recordatorios: input.correo_recordatorios, correo_informativos: input.correo_informativos }, { onConflict: 'usuario_id' })
      .select('usuario_id, correo_recordatorios, correo_informativos, actualizado_en')
      .maybeSingle();
    if (error) throw AppError.interno(`No fue posible guardar las preferencias: ${error.message}`);
    const despues = (data as FilaPreferencia | null) ?? { ...antes, ...input, actualizado_en: new Date().toISOString() };
    await auditar({
      ...ctx,
      actor_id: user.id,
      actor_tipo: 'USUARIO',
      actor_rol: user.rol,
      accion: 'ACTUALIZAR',
      entidad: 'NOTIFICACION',
      entidad_id: user.id,
      datos_antes: { correo_recordatorios: antes.correo_recordatorios, correo_informativos: antes.correo_informativos },
      datos_despues: { correo_recordatorios: despues.correo_recordatorios, correo_informativos: despues.correo_informativos },
      metadatos: { objeto: 'PREFERENCIA_NOTIFICACION' },
    });
    return despues;
  },
};
