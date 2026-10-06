import { schedule, type ScheduledTask } from 'node-cron';
import { env, hasSupabaseCredentials } from '../../config/env';
import { logger, supabaseAdmin } from '../../shared';
import { limpiarCacheDashboard } from './dashboard_funcionario.service';

/**
 * Job de refresco de metricas (DECISIONES section 15 y section 19: node-cron en el prototipo).
 * Cada 5 minutos ejecuta `fn_refrescar_metricas()` (0001_base.sql), que hace
 * REFRESH MATERIALIZED VIEW CONCURRENTLY de mv_postulacion_envio y
 * mv_postulacion_beneficio y escribe el sello en `metricas_refresh`
 * (estado OK/ERROR; ante error se conservan los datos previos y la ultima hora valida).
 */
export const CRON_REFRESCO_METRICAS = '*/5 * * * *';

let tarea: ScheduledTask | null = null;
let enCurso = false;

export interface ResultadoRefresco {
  ok: boolean;
  duracion_ms: number;
  error?: string;
}

export async function refrescarMetricas(): Promise<ResultadoRefresco> {
  if (enCurso) return { ok: false, duracion_ms: 0, error: 'REFRESCO_EN_CURSO' };
  enCurso = true;
  const t0 = Date.now();
  try {
    const { error } = await supabaseAdmin.rpc('fn_refrescar_metricas');
    const duracion_ms = Date.now() - t0;
    if (error) {
      logger.error({ err: error, duracion_ms }, 'fn_refrescar_metricas fallo');
      return { ok: false, duracion_ms, error: error.message };
    }
    // Los agregados cacheados quedan obsoletos tras un refresco exitoso.
    limpiarCacheDashboard();
    logger.info({ duracion_ms }, 'Vistas materializadas de metricas refrescadas');
    return { ok: true, duracion_ms };
  } catch (e) {
    const duracion_ms = Date.now() - t0;
    logger.error({ err: e, duracion_ms }, 'Error inesperado al refrescar metricas');
    return { ok: false, duracion_ms, error: e instanceof Error ? e.message : String(e) };
  } finally {
    enCurso = false;
  }
}

/** Inicia el job (idempotente). Devuelve null en pruebas o sin credenciales. */
export function iniciarJobRefrescoMetricas(): ScheduledTask | null {
  if (tarea) return tarea;
  if (env.NODE_ENV === 'test' || !hasSupabaseCredentials()) return null;
  tarea = schedule(CRON_REFRESCO_METRICAS, () => {
    void refrescarMetricas();
  });
  // Primer refresco poco despues de arrancar, para que el sello exista desde el inicio.
  setTimeout(() => void refrescarMetricas(), 5_000).unref();
  logger.info({ cron: CRON_REFRESCO_METRICAS }, 'Job de refresco de metricas programado');
  return tarea;
}

export function detenerJobRefrescoMetricas(): void {
  if (!tarea) return;
  void tarea.stop();
  tarea = null;
}
