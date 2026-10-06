import cron, { type ScheduledTask } from 'node-cron';
import { logger, supabaseAdmin } from '../../../shared';
import { postulacionService } from '../postulacion.service';

/**
 * Job de vencimiento de subsanacion (postulaciones.md): cada 15 minutos busca
 * postulaciones EN_CORRECCION con `fecha_limite_subsanacion < now()` y las pasa a
 * RECHAZADA con motivo VENCIMIENTO_SUBSANACION (actor SISTEMA) a traves de
 * `transicionar()`. node-cron para el prototipo (DECISIONES seccion 19); BullMQ en produccion.
 */
export const CRON_VENCIMIENTO_SUBSANACION = '*/15 * * * *';

let tarea: ScheduledTask | null = null;
let corriendo = false;

export async function ejecutarVencimientoSubsanacion(ahora = new Date()): Promise<{ procesadas: number; errores: number }> {
  if (corriendo) return { procesadas: 0, errores: 0 };
  corriendo = true;
  let procesadas = 0;
  let errores = 0;
  try {
    const { data, error } = await supabaseAdmin
      .from('postulacion')
      .select('id, fecha_limite_subsanacion')
      .eq('estado', 'EN_CORRECCION')
      .lt('fecha_limite_subsanacion', ahora.toISOString())
      .limit(200);
    if (error) {
      logger.error({ err: error }, 'Job vencimiento-subsanacion: fallo la consulta');
      return { procesadas, errores: 1 };
    }
    for (const fila of (data ?? []) as Array<{ id: string; fecha_limite_subsanacion: string }>) {
      try {
        await postulacionService.transicionar(fila.id, 'RECHAZADA', {
          actor: { tipo: 'SISTEMA' },
          motivo: 'VENCIMIENTO_SUBSANACION',
          observaciones: `Plazo de subsanacion vencido el ${fila.fecha_limite_subsanacion}`,
        });
        procesadas += 1;
      } catch (e) {
        errores += 1;
        logger.error({ err: e, postulacion_id: fila.id }, 'Job vencimiento-subsanacion: no fue posible rechazar');
      }
    }
    if (procesadas > 0 || errores > 0) logger.info({ procesadas, errores }, 'Job vencimiento-subsanacion ejecutado');
  } finally {
    corriendo = false;
  }
  return { procesadas, errores };
}

export function iniciarJobVencimientoSubsanacion(): ScheduledTask {
  if (tarea) return tarea;
  tarea = cron.schedule(CRON_VENCIMIENTO_SUBSANACION, () => {
    void ejecutarVencimientoSubsanacion();
  });
  logger.info({ cron: CRON_VENCIMIENTO_SUBSANACION }, 'Job vencimiento-subsanacion programado');
  return tarea;
}

export function detenerJobVencimientoSubsanacion(): void {
  if (tarea) {
    void tarea.stop();
    tarea = null;
  }
}
