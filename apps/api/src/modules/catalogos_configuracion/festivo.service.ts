import type { DiasHabilesResultado, FestivoCrear, FestivoItem, FestivosCargaAnual, FestivosQuery } from '@foest/shared';
import { AppError, auditar, supabaseAdmin, supabaseAsUser, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { fechaLocalBogota, finDeDiaExclusivo, invalidarCacheFestivos, sumarDiasHabiles } from './business-days';
import { festivosColombia, type FestivoPropuesto } from './festivos.calendario';
import type { ResultadoCargaAnual } from './catalogos_configuracion.types';

/**
 * Festivos (catalogos_configuracion.md). Lectura: cualquier usuario autenticado con
 * catalogo:consultar (RLS festivo_select). Escritura: ADMINISTRADOR con service_role,
 * auditada (CREAR / ELIMINAR / ACTUALIZAR sobre FESTIVO). La carga anual reemplaza
 * SOLO los festivos del anio indicado de forma atomica (RPC fn_festivos_reemplazar_anio).
 */
export const festivoService = {
  async listar(user: UsuarioAutenticado, query: FestivosQuery): Promise<{ anio: number; data: FestivoItem[] }> {
    const anio = query.anio ?? Number(fechaLocalBogota().slice(0, 4));
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
    invalidarCacheFestivos(anio);
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
    invalidarCacheFestivos((actual as FestivoItem).anio);
  },

  /** Reemplaza los festivos del anio (atomico en BD) y audita con el snapshot anterior. */
  async cargaAnual(user: UsuarioAutenticado, cuerpo: FestivosCargaAnual, contexto: Partial<EventoAuditoria>): Promise<ResultadoCargaAnual> {
    const fechas = new Set<string>();
    for (const f of cuerpo.festivos) {
      if (fechas.has(f.fecha)) throw AppError.datosInvalidos('FESTIVO_DUPLICADO', 'Hay fechas repetidas en la carga', { fecha: f.fecha });
      fechas.add(f.fecha);
    }
    const { data: antes, error: errAntes } = await supabaseAdmin.from('festivo').select('*').eq('anio', cuerpo.anio).order('fecha');
    if (errAntes) throw AppError.interno(`No fue posible leer los festivos actuales: ${errAntes.message}`);

    const { data, error } = await supabaseAdmin.rpc('fn_festivos_reemplazar_anio', {
      p_anio: cuerpo.anio,
      p_festivos: cuerpo.festivos,
      p_actor: user.id,
    });
    if (error) throw AppError.interno(`No fue posible cargar los festivos del anio: ${error.message}`);
    const r = (data ?? {}) as { eliminados?: number; insertados?: number };
    const resultado: ResultadoCargaAnual = { anio: cuerpo.anio, eliminados: r.eliminados ?? 0, insertados: r.insertados ?? cuerpo.festivos.length };

    await auditar({
      ...contexto,
      accion: 'ACTUALIZAR',
      entidad: 'FESTIVO',
      entidad_id: String(cuerpo.anio),
      datos_antes: { anio: cuerpo.anio, festivos: antes ?? [] },
      datos_despues: { anio: cuerpo.anio, festivos: cuerpo.festivos },
      metadatos: { carga_anual: true, ...resultado },
    });
    invalidarCacheFestivos(cuerpo.anio);
    return resultado;
  },

  /** Propuesta calculada (Ley Emiliani) para prellenar la carga anual. */
  propuesta(anio: number): { anio: number; festivos: FestivoPropuesto[] } {
    return { anio, festivos: festivosColombia(anio) };
  },

  async diasHabiles(desde: string, n: number): Promise<DiasHabilesResultado> {
    const resultado = await sumarDiasHabiles(desde, n);
    return { desde, n, resultado, fin_del_dia_exclusivo: finDeDiaExclusivo(resultado).toISOString() };
  },
};
