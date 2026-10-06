import cron, { type ScheduledTask } from 'node-cron';
import { hasSupabaseCredentials } from '../../config/env';
import { logger, supabaseAdmin } from '../../shared';
import { alertarAdministradores } from '../notificaciones';
import { ZONA_BOGOTA, fechaLocalBogota } from './business-days';

/**
 * Job del modulo (catalogos_configuracion.md, "Festivos y dias habiles"): si no
 * hay festivos cargados para el anio siguiente, se alerta a los administradores
 * con una notificacion in-app SISTEMA (dedup por anio) al arrancar y, en
 * diciembre, cada dia a las 08:00 America/Bogota.
 * Usa `alertarAdministradores` del modulo notificaciones (aviso SISTEMA, solo buzon).
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

  const notificados = await alertarAdministradores(
    `Festivos de ${anio} sin cargar`,
    `No hay festivos registrados para el anio ${anio}. Cargue el calendario en Administracion > Festivos para que el calculo de dias habiles sea correcto.`,
    `FESTIVOS_FALTANTES_${anio}`,
    '/admin/festivos',
  );
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
