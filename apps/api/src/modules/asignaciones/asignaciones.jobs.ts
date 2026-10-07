import cron, { type ScheduledTask } from 'node-cron';
import { hasSupabaseCredentials } from '../../config/env';
import { logger, supabaseAdmin } from '../../shared';
import { diasHabilesEntre, fechaLocalBogota } from '../catalogos_configuracion';
import { auditarFueraDeTx } from '../auditoria/auditoria.cola';
import { alertarAdministradores, encolarNotificacion } from '../notificaciones';
import { asignacionesService } from './asignaciones.service';

/**
 * Job diario (08:30 America/Bogota): detecta asignaciones ACTIVAS sin movimiento por mas de
 * ALERTA_ASIGNACION_SIN_MOVIMIENTO_DIAS_HABILES dias habiles. Recuerda al titular y avisa a los
 * administradores. Una asignacion se alerta una vez por periodo sin movimiento (se re-alerta si
 * pasan otros N dias habiles). La alerta no libera la asignacion.
 */
let tarea: ScheduledTask | null = null;
let ejecutando = false;

export async function ejecutarAlertasSinMovimiento(): Promise<{ alertadas: number }> {
  if (ejecutando) return { alertadas: 0 };
  ejecutando = true;
  try {
    const { alertas, umbral } = await asignacionesService.detectarSinMovimiento();
    const hoy = fechaLocalBogota();
    // Titular inactivo o fuera del comite: ya salen con prioridad alta en el listado; el aviso se centra en la inactividad.
    const candidatas = alertas.filter((a) => a.dias_habiles_sin_movimiento > umbral);
    if (candidatas.length === 0) return { alertadas: 0 };

    const ids = candidatas.map((a) => a.asignacion_id);
    const { data, error } = await supabaseAdmin.from('postulacion_asignacion').select('id, ultima_alerta_en, ultimo_movimiento_en').in('id', ids);
    if (error) throw new Error(error.message);
    const previas = new Map(((data ?? []) as Array<{ id: string; ultima_alerta_en: string | null; ultimo_movimiento_en: string }>).map((f) => [f.id, f]));

    let alertadas = 0;
    for (const a of candidatas) {
      const previa = previas.get(a.asignacion_id);
      const ultima = previa?.ultima_alerta_en ?? null;
      if (ultima && new Date(ultima).getTime() >= new Date(previa?.ultimo_movimiento_en ?? 0).getTime()) {
        const desdeUltima = await diasHabilesEntre(fechaLocalBogota(new Date(ultima)), hoy);
        if (desdeUltima < umbral) continue;
      }
      try {
        await encolarNotificacion({
          usuario_id: a.funcionario_id,
          tipo: 'ASIGNACION_SIN_MOVIMIENTO',
          titulo: 'Expediente sin movimiento',
          mensaje: `El expediente ${a.codigo_expediente} lleva ${a.dias_habiles_sin_movimiento} dias habiles sin movimiento. Continue la revision o liberelo para que otro evaluador lo tome.`,
          entidad: 'ASIGNACION',
          entidad_id: a.asignacion_id,
          url_destino: '/funcionario/bandeja',
          clave_dedup: `ASIGNACION_SIN_MOVIMIENTO:${a.asignacion_id}:${hoy}`,
          canal: 'APP',
        });
        const { error: errUp } = await supabaseAdmin.from('postulacion_asignacion').update({ ultima_alerta_en: new Date().toISOString() }).eq('id', a.asignacion_id).eq('estado', 'ACTIVA');
        if (errUp) throw new Error(errUp.message);
        alertadas += 1;
      } catch (e) {
        logger.error({ err: e, asignacion_id: a.asignacion_id }, 'No fue posible alertar una asignacion sin movimiento');
      }
    }
    if (alertadas > 0) {
      await alertarAdministradores(
        'Asignaciones sin movimiento',
        `${alertadas} expediente(s) llevan mas de ${umbral} dias habiles sin movimiento. Revise las alertas de asignaciones y reasigne si corresponde.`,
        `ASIGNACIONES_SIN_MOVIMIENTO:${hoy}`,
        '/admin/asignaciones',
      );
      await auditarFueraDeTx({
        actor_tipo: 'SISTEMA',
        accion: 'NOTIFICAR',
        entidad: 'ASIGNACION',
        metadatos: { job: 'alerta_sin_movimiento', alertadas, umbral_dias_habiles: umbral },
      });
      logger.info({ alertadas }, 'Alertas de asignaciones sin movimiento enviadas');
    }
    return { alertadas };
  } catch (e) {
    logger.error({ err: e }, 'Fallo el job de alertas de asignaciones sin movimiento');
    return { alertadas: 0 };
  } finally {
    ejecutando = false;
  }
}

/** Idempotente. No hace nada sin credenciales de Supabase ni en pruebas. */
export function iniciarJobsAsignaciones(): boolean {
  if (tarea) return true;
  if (process.env.NODE_ENV === 'test' || !hasSupabaseCredentials()) return false;
  tarea = cron.schedule('30 8 * * *', () => void ejecutarAlertasSinMovimiento(), { timezone: 'America/Bogota' });
  logger.info('Job de asignaciones iniciado (alerta sin movimiento 08:30 America/Bogota)');
  return true;
}

export function detenerJobsAsignaciones(): void {
  tarea?.stop();
  tarea = null;
}
