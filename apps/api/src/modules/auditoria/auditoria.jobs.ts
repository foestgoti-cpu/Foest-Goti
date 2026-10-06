import cron, { type ScheduledTask } from 'node-cron';
import { hasSupabaseCredentials } from '../../config/env';
import { logger } from '../../shared';
import { procesarPendientes } from './auditoria.cola';
import { auditoriaService } from './auditoria.service';

/**
 * Jobs del modulo auditoria (node-cron; DECISIONES section 19):
 *  - cada minuto: consumidor de la cola `auditoria_evento_pendiente` (eventos fuera de tx);
 *  - diario 02:30 America/Bogota: verificacion incremental de la cadena de hashes
 *    (los domingos, verificacion completa); una ruptura notifica a los administradores;
 *  - mensual (dia 1, 03:00): revision de retencion (RETENCION_AUDITORIA_ANIOS); solo informa.
 */
const ZONA_HORARIA = 'America/Bogota';
let tareas: ScheduledTask[] = [];
let procesandoCola = false;

export async function ejecutarCola(): Promise<{ procesados: number; fallidos: number }> {
  if (procesandoCola) return { procesados: 0, fallidos: 0 };
  procesandoCola = true;
  try {
    const r = await procesarPendientes();
    if (r.procesados > 0 || r.fallidos > 0) logger.info(r, 'Cola de auditoria procesada');
    return r;
  } catch (e) {
    logger.error({ err: e }, 'Fallo el consumidor de la cola de auditoria');
    return { procesados: 0, fallidos: 0 };
  } finally {
    procesandoCola = false;
  }
}

export async function ejecutarVerificacionIntegridad(completa = new Date().getDay() === 0): Promise<boolean> {
  try {
    const r = await auditoriaService.verificarIntegridad({ completa, origen: 'JOB' });
    logger.info({ valida: r.valida, desde: r.secuencia_desde, hasta: r.secuencia_hasta, total: r.total_verificados }, 'Verificacion de integridad de auditoria');
    return r.valida;
  } catch (e) {
    logger.error({ err: e }, 'Fallo la verificacion de integridad de auditoria');
    return false;
  }
}

export async function ejecutarRevisionRetencion(): Promise<void> {
  try {
    const r = await auditoriaService.revisarRetencion();
    if (r) logger.info(r, 'Revision de retencion de auditoria');
  } catch (e) {
    logger.error({ err: e }, 'Fallo la revision de retencion de auditoria');
  }
}

/** Idempotente. No hace nada sin credenciales de Supabase ni en pruebas. */
export function iniciarJobsAuditoria(): boolean {
  if (tareas.length > 0) return true;
  if (process.env.NODE_ENV === 'test' || !hasSupabaseCredentials()) return false;
  tareas = [
    cron.schedule('* * * * *', () => void ejecutarCola(), { timezone: ZONA_HORARIA }),
    cron.schedule('30 2 * * *', () => void ejecutarVerificacionIntegridad(), { timezone: ZONA_HORARIA }),
    cron.schedule('0 3 1 * *', () => void ejecutarRevisionRetencion(), { timezone: ZONA_HORARIA }),
  ];
  setTimeout(() => void ejecutarCola(), 5_000).unref();
  logger.info('Jobs de auditoria iniciados (cola cada minuto; integridad 02:30; retencion dia 1 03:00 America/Bogota)');
  return true;
}

export function detenerJobsAuditoria(): void {
  for (const t of tareas) t.stop();
  tareas = [];
}
