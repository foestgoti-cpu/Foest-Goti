import cron, { type ScheduledTask } from 'node-cron';
import { hasSupabaseCredentials } from '../../config/env';
import { logger } from '../../shared';
import { auditarFueraDeTx } from '../auditoria/auditoria.cola';
import { exportReportsService } from './export_reports.service';

/**
 * Job (cada minuto, America/Bogota): procesa los reportes en COLA de a uno (bloqueo optimista en
 * `tomarSiguienteDeCola`), notifica "reporte listo" y purga los archivos vencidos segun
 * REPORTE_RETENCION_HORAS. Vigila los trabajos PROCESANDO por mas de 15 minutos (FALLIDO/TIMEOUT).
 */
const MAX_POR_EJECUCION = 5;
let tareas: ScheduledTask[] = [];
let ejecutando = false;

export async function ejecutarColaReportes(): Promise<{ procesados: number }> {
  if (ejecutando) return { procesados: 0 };
  ejecutando = true;
  let procesados = 0;
  try {
    for (let i = 0; i < MAX_POR_EJECUCION; i += 1) {
      const reporte = await exportReportsService.tomarSiguienteDeCola();
      if (!reporte) break;
      await exportReportsService.procesarTomado(reporte);
      procesados += 1;
    }
    const { purgados, atascados } = await exportReportsService.purgarVencidos();
    if (purgados > 0 || atascados > 0) {
      await auditarFueraDeTx({
        actor_tipo: 'SISTEMA',
        accion: 'PURGA_RETENCION',
        entidad: 'REPORTE',
        metadatos: { job: 'export_reports', purgados, atascados },
      });
      logger.info({ purgados, atascados }, 'Purga de reportes ejecutada');
    }
  } catch (e) {
    logger.error({ err: e }, 'Fallo el job de la cola de reportes');
  } finally {
    ejecutando = false;
  }
  return { procesados };
}

/** Idempotente. No hace nada sin credenciales de Supabase ni en pruebas. */
export function iniciarJobsReportes(): boolean {
  if (tareas.length > 0) return true;
  if (process.env.NODE_ENV === 'test' || !hasSupabaseCredentials()) return false;
  tareas = [cron.schedule('* * * * *', () => void ejecutarColaReportes(), { timezone: 'America/Bogota' })];
  logger.info('Job de reportes iniciado (cola cada minuto)');
  return true;
}

export function detenerJobsReportes(): void {
  for (const t of tareas) void t.stop();
  tareas = [];
}
