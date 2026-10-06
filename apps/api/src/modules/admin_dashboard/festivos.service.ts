import { AppError, auditar, supabaseAdmin, supabaseAsUser, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { invalidarCache } from './cache';
import type { FestivoCrear, FestivosQuery } from './admin_dashboard.dto';
import type { FestivoItem } from './admin_dashboard.types';

/**
 * Endpoints minimos de festivos (catalogos_configuracion.md) implementados en este
 * lote. Lectura: cualquier usuario autenticado (RLS festivo_select). Escritura:
 * ADMINISTRADOR con service_role, auditada (CREAR / ELIMINAR sobre FESTIVO).
 */
export const festivosService = {
  async listar(user: UsuarioAutenticado, query: FestivosQuery): Promise<{ anio: number; data: FestivoItem[] }> {
    const anio = query.anio ?? new Date().getFullYear();
    const db = supabaseAsUser(user.token);
    const { data, error } = await db.from('festivo').select('*').eq('anio', anio).order('fecha');
    if (error) throw AppError.interno(`No fue posible consultar los festivos: ${error.message}`);
    return { anio, data: (data ?? []) as FestivoItem[] };
  },

  async crear(user: UsuarioAutenticado, cuerpo: FestivoCrear, contexto: Partial<EventoAuditoria>): Promise<FestivoItem> {
    const anio = Number(cuerpo.fecha.slice(0, 4));
    const { data, error } = await supabaseAdmin
      .from('festivo')
      .insert({ fecha: cuerpo.fecha, nombre: cuerpo.nombre, anio, creado_por: user.id })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') throw AppError.conflicto('FESTIVO_DUPLICADO', 'Ya existe un festivo en esa fecha', { fecha: cuerpo.fecha });
      throw AppError.interno(`No fue posible crear el festivo: ${error.message}`);
    }
    const festivo = data as FestivoItem;
    await auditar({ ...contexto, accion: 'CREAR', entidad: 'FESTIVO', entidad_id: festivo.id, datos_despues: festivo });
    invalidarCache('admin:');
    return festivo;
  },

  async eliminar(user: UsuarioAutenticado, id: string, contexto: Partial<EventoAuditoria>): Promise<void> {
    const db = supabaseAsUser(user.token);
    const { data: actual, error: errLeer } = await db.from('festivo').select('*').eq('id', id).maybeSingle();
    if (errLeer) throw AppError.interno(`No fue posible consultar el festivo: ${errLeer.message}`);
    if (!actual) throw AppError.noEncontrado('FESTIVO_NO_ENCONTRADO', 'El festivo no existe');

    const { error } = await supabaseAdmin.from('festivo').delete().eq('id', id);
    if (error) throw AppError.interno(`No fue posible eliminar el festivo: ${error.message}`);
    await auditar({ ...contexto, accion: 'ELIMINAR', entidad: 'FESTIVO', entidad_id: id, datos_antes: actual });
    invalidarCache('admin:');
  },
};
