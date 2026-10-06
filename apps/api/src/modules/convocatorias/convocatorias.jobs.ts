import cron, { type ScheduledTask } from 'node-cron';
import { hasSupabaseCredentials } from '../../config/env';
import { logger } from '../../shared';
import { ZONA_HORARIA } from './convocatorias.fechas';
import { convocatoriasService } from './convocatorias.service';

/**
 * Jobs del modulo (convocatorias.md):
 *  - cada minuto: cierra las HABILITADA/SUSPENDIDA vencidas (origen CRON; redundante
 *    con el calculo en tiempo real, ninguna regla depende solo del cron);
 *  - diario 08:00 America/Bogota: recordatorio de cierre a administradores y comite.
 * Prototipo con node-cron (DECISIONES section 19); BullMQ queda para produccion.
 */
let tareas: ScheduledTask[] = [];
let ejecutandoCierre = false;

export async function ejecutarCierreVencidas(): Promise<string[]> {
  if (ejecutandoCierre) return [];
  ejecutandoCierre = true;
  try {
    const cerradas = await convocatoriasService.sincronizarCierreVencidas('CRON');
    if (cerradas.length > 0) logger.info({ cerradas }, 'Convocatorias cerradas por vencimiento de plazo');
    return cerradas;
  } catch (e) {
    logger.error({ err: e }, 'Fallo el job de cierre de convocatorias');
    return [];
  } finally {
    ejecutandoCierre = false;
  }
}

export async function ejecutarRecordatorioCierre(): Promise<string[]> {
  try {
    const notificadas = await convocatoriasService.recordarCierreProximo();
    if (notificadas.length > 0) logger.info({ notificadas }, 'Recordatorio de cierre de convocatoria enviado');
    return notificadas;
  } catch (e) {
    logger.error({ err: e }, 'Fallo el job de recordatorio de cierre');
    return [];
  }
}

/** Idempotente. No hace nada sin credenciales de Supabase ni en pruebas. */
export function iniciarJobsConvocatorias(): boolean {
  if (tareas.length > 0) return true;
  if (process.env.NODE_ENV === 'test' || !hasSupabaseCredentials()) return false;
  tareas = [
    cron.schedule('* * * * *', () => void ejecutarCierreVencidas(), { timezone: ZONA_HORARIA }),
    cron.schedule('0 8 * * *', () => void ejecutarRecordatorioCierre(), { timezone: ZONA_HORARIA }),
  ];
  // Primera sincronizacion al arrancar (por si el proceso estuvo detenido).
  setTimeout(() => void ejecutarCierreVencidas(), 2_000).unref();
  logger.info('Jobs de convocatorias iniciados (cierre cada minuto; recordatorio 08:00 America/Bogota)');
  return true;
}

export function detenerJobsConvocatorias(): void {
  for (const t of tareas) t.stop();
  tareas = [];
}
