import cron, { type ScheduledTask } from 'node-cron';
import { hasSupabaseCredentials } from '../../config/env';
import { logger } from '../../shared';
import { auditarFueraDeTx } from '../auditoria/auditoria.cola';
import { fechaLocalBogota } from '../catalogos_configuracion';
import { alertarAdministradores } from '../notificaciones';
import { calcularCupos } from './seguimiento_beneficios.cupos';

/**
 * Job diario (07:00 America/Bogota): alerta a los administradores cuando la ocupacion de cupos o de
 * presupuesto de un (convocatoria, beneficio) alcanza ALERTA_PRESUPUESTO_PORCENTAJE o la excede.
 * Una alerta por (convocatoria, beneficio, nivel, dia). Solo alerta: nunca bloquea nada.
 * Las convocatorias ARCHIVADA no se alertan.
 */
let tarea: ScheduledTask | null = null;
let ejecutando = false;

export async function ejecutarAlertasCupos(): Promise<{ alertadas: number }> {
  if (ejecutando) return { alertadas: 0 };
  ejecutando = true;
  try {
    const hoy = fechaLocalBogota();
    const cupos = await calcularCupos();
    let alertadas = 0;
    for (const c of cupos) {
      if (c.convocatoria_estado === 'ARCHIVADA') continue;
      const niveles = [c.alerta_cupos, c.alerta_presupuesto];
      if (niveles.every((n) => n === 'NORMAL')) continue;
      const excedida = niveles.includes('EXCEDIDA');
      const partes: string[] = [];
      if (c.alerta_cupos !== 'NORMAL') partes.push(`cupos ${c.cupos_ocupados} de ${c.cupos_estimados} (${c.pct_cupos} %)`);
      if (c.alerta_presupuesto !== 'NORMAL') partes.push(`presupuesto comprometido al ${c.pct_presupuesto} %`);
      const n = await alertarAdministradores(
        excedida ? 'Cupo o presupuesto excedido' : 'Cupo o presupuesto por agotarse',
        `Beneficio ${c.beneficio_codigo}${c.convocatoria_nombre ? ` de ${c.convocatoria_nombre}` : ''}: ${partes.join('; ')}. Umbral de alerta: ${c.umbral_alerta_pct} %.`,
        `CUPOS:${c.convocatoria_id}:${c.beneficio_codigo}:${excedida ? 'EXCEDIDA' : 'PREVENTIVA'}:${hoy}`,
        `/admin/seguimiento/cupos`,
      );
      alertadas += n > 0 ? 1 : 0;
    }
    if (alertadas > 0) {
      await auditarFueraDeTx({
        actor_tipo: 'SISTEMA',
        accion: 'NOTIFICAR',
        entidad: 'CONVOCATORIA_BENEFICIO',
        metadatos: { job: 'alerta_cupos_presupuesto', alertadas },
      });
      logger.info({ alertadas }, 'Alertas de cupos y presupuesto enviadas');
    }
    return { alertadas };
  } catch (e) {
    logger.error({ err: e }, 'Fallo el job de alertas de cupos y presupuesto');
    return { alertadas: 0 };
  } finally {
    ejecutando = false;
  }
}

/** Idempotente. No hace nada sin credenciales de Supabase ni en pruebas. */
export function iniciarJobsSeguimiento(): boolean {
  if (tarea) return true;
  if (process.env.NODE_ENV === 'test' || !hasSupabaseCredentials()) return false;
  tarea = cron.schedule('0 7 * * *', () => void ejecutarAlertasCupos(), { timezone: 'America/Bogota' });
  logger.info('Job de seguimiento iniciado (alerta de cupos y presupuesto 07:00 America/Bogota)');
  return true;
}

export function detenerJobsSeguimiento(): void {
  tarea?.stop();
  tarea = null;
}
