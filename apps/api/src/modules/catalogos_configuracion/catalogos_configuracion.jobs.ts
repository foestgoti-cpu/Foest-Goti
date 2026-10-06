import cron, { type ScheduledTask } from 'node-cron';
import { hasSupabaseCredentials } from '../../config/env';
import { logger, supabaseAdmin } from '../../shared';
import { ZONA_BOGOTA, fechaLocalBogota } from './business-days';

/**
 * Job del modulo (catalogos_configuracion.md, "Festivos y dias habiles"): si no
 * hay festivos cargados para el anio siguiente, se alerta a los administradores
 * con una notificacion in-app SISTEMA (dedup por anio) al arrancar y, en
 * diciembre, cada dia a las 08:00 America/Bogota.
 * PROVISIONAL(notificaciones): inserta directamente en `notificacion`; cuando el
 * modulo notificaciones exponga su servicio, reemplazar por su API publica.
 */
let tareas: ScheduledTask[] = [];

export async function verificarFestivosAnioSiguiente(forzar = false): Promise<{ anio: number; faltan: boolean; notificados: number }> {
  const hoy = fechaLocalBogota();
  const anio = Number(hoy.slice(0, 4)) + 1;
  const esDiciembre = hoy.slice(5, 7) === '12';
  if (!forzar && !esDiciembre) return { anio, faltan: false, notificados: 0 };

  const { count, error } = await supabaseAdmin.from('festivo').select('id', { head: true, count: 'exact' }).eq('anio', anio);
  if (error) throw new Error(`No fue posible verificar los festivos de ${anio}: ${error.message}`);
  if ((count ?? 0) > 0) return { anio, faltan: false, notificados: 0 };

  const { data: admins, error: errAdm } = await supabaseAdmin.from('usuario').select('id').eq('rol', 'ADMINISTRADOR').eq('activo', true);
  if (errAdm) throw new Error(`No fue posible listar administradores: ${errAdm.message}`);
  let notificados = 0;
  for (const a of (admins ?? []) as Array<{ id: string }>) {
    const { error: errIns } = await supabaseAdmin.from('notificacion').insert({
      usuario_id: a.id,
      tipo: 'SISTEMA',
      titulo: `Festivos de ${anio} sin cargar`,
      mensaje: `No hay festivos registrados para el anio ${anio}. Cargue el calendario en Administracion > Festivos para que el calculo de dias habiles sea correcto.`,
      entidad: 'FESTIVO',
      entidad_id: String(anio),
      url_destino: '/admin/festivos',
      severidad: 'ADVERTENCIA',
      clave_dedup: `FESTIVOS_FALTANTES_${anio}`,
    });
    if (!errIns) notificados += 1;
    else if (errIns.code !== '23505') logger.warn({ err: errIns }, 'No fue posible notificar festivos faltantes');
  }
  return { anio, faltan: true, notificados };
}

async function ejecutar(forzar: boolean): Promise<void> {
  try {
    const r = await verificarFestivosAnioSiguiente(forzar);
    if (r.faltan) logger.warn({ anio: r.anio, notificados: r.notificados }, 'Festivos del anio siguiente sin cargar');
  } catch (e) {
    logger.error({ err: e }, 'Fallo la verificacion de festivos del anio siguiente');
  }
}

/** Idempotente. No hace nada sin credenciales de Supabase ni en pruebas. */
export function iniciarJobsCatalogos(): boolean {
  if (tareas.length > 0) return true;
  if (process.env.NODE_ENV === 'test' || !hasSupabaseCredentials()) return false;
  tareas = [cron.schedule('0 8 * * *', () => void ejecutar(false), { timezone: ZONA_BOGOTA })];
  setTimeout(() => void ejecutar(true), 3_000).unref();
  logger.info('Jobs de catalogos iniciados (verificacion de festivos del anio siguiente)');
  return true;
}

export function detenerJobsCatalogos(): void {
  for (const t of tareas) t.stop();
  tareas = [];
}
