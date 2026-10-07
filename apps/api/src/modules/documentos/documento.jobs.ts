import cron, { type ScheduledTask } from 'node-cron';
import { hasSupabaseCredentials } from '../../config/env';
import { logger } from '../../shared';
import { documentoService } from './documento.service';

/**
 * Jobs del modulo (documentos.md), con node-cron (DECISIONES section 19):
 *  - cada hora: purga de cargas en SUBIENDO con mas de 24 h (objeto y fila);
 *  - cada 2 minutos: reintento del escaneo de versiones que quedaron en ESCANEANDO (antivirus caido);
 *  - diario 03:00 America/Bogota: purga de eliminados logicamente tras RETENCION_DOCUMENTOS_ANIOS
 *    (no actua si la configuracion esta vacia).
 */
const ZONA = 'America/Bogota';
let tareas: ScheduledTask[] = [];
let ocupado = { purga: false, escaneo: false, retencion: false };

export async function ejecutarPurgaSubiendo(): Promise<number> {
  if (ocupado.purga) return 0;
  ocupado.purga = true;
  try {
    const n = await documentoService.purgarSubiendo();
    if (n > 0) logger.info({ purgadas: n }, 'Cargas en SUBIENDO vencidas purgadas');
    return n;
  } catch (e) {
    logger.error({ err: e }, 'Fallo la purga de cargas en SUBIENDO');
    return 0;
  } finally {
    ocupado.purga = false;
  }
}

export async function ejecutarReintentoEscaneos(): Promise<number> {
  if (ocupado.escaneo) return 0;
  ocupado.escaneo = true;
  try {
    return await documentoService.reintentarEscaneos();
  } catch (e) {
    logger.error({ err: e }, 'Fallo el reintento de escaneos');
    return 0;
  } finally {
    ocupado.escaneo = false;
  }
}

export async function ejecutarPurgaRetencion(): Promise<number> {
  if (ocupado.retencion) return 0;
  ocupado.retencion = true;
  try {
    const n = await documentoService.purgarRetencion();
    if (n > 0) logger.info({ purgados: n }, 'Documentos eliminados purgados por retencion');
    return n;
  } catch (e) {
    logger.error({ err: e }, 'Fallo la purga por retencion de documentos');
    return 0;
  } finally {
    ocupado.retencion = false;
  }
}

/** Idempotente. No hace nada sin credenciales de Supabase ni en pruebas. */
export function iniciarJobsDocumentos(): boolean {
  if (tareas.length > 0) return true;
  if (process.env.NODE_ENV === 'test' || !hasSupabaseCredentials()) return false;
  tareas = [
    cron.schedule('7 * * * *', () => void ejecutarPurgaSubiendo(), { timezone: ZONA }),
    cron.schedule('*/2 * * * *', () => void ejecutarReintentoEscaneos(), { timezone: ZONA }),
    cron.schedule('0 3 * * *', () => void ejecutarPurgaRetencion(), { timezone: ZONA }),
  ];
  logger.info('Jobs de documentos iniciados (purga SUBIENDO cada hora; reintento de escaneo cada 2 min; retencion 03:00)');
  return true;
}

export function detenerJobsDocumentos(): void {
  for (const t of tareas) t.stop();
  tareas = [];
  ocupado = { purga: false, escaneo: false, retencion: false };
}
