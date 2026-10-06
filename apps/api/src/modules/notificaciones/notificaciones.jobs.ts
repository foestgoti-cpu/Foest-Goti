import cron, { type ScheduledTask } from 'node-cron';
import { hasSupabaseCredentials } from '../../config/env';
import { logger, supabaseAdmin } from '../../shared';
import { leerConfigInt } from './notificaciones.config';
import { fechaLocalBogota, textoCierre, textoFecha, ZONA_BOGOTA } from './notificaciones.fechas';
import type { EncolarNotificacionInput, FuenteRecordatorio } from './notificaciones.types';
import { encolarNotificacion, procesarOutbox, recuperarAtascados } from './outbox.service';

/**
 * Jobs del modulo (node-cron, America/Bogota; DECISIONES seccion 19: sin BullMQ en el prototipo):
 *  - cada minuto: worker del outbox (reintentos con backoff);
 *  - cada 5 min: recuperar eventos EN_PROCESO > 10 min;
 *  - diario 08:00: recordatorios (RECORDATORIO_BORRADOR, SUBSANACION_POR_VENCER y fuentes registradas);
 *  - mensual (dia 1, 03:00): limpieza de notificaciones leidas y compactacion del outbox.
 * CONVOCATORIA_POR_CERRAR lo ejecuta el modulo convocatorias; ASIGNACION_SIN_MOVIMIENTO y
 * ALERTA_SOBRECARGA llegan como `FuenteRecordatorio` registradas por asignaciones/evaluacion.
 */

let tareas: ScheduledTask[] = [];
const fuentes = new Map<string, FuenteRecordatorio>();

/** Patron ReminderSource: otro modulo registra una consulta de solo lectura que devuelve notificaciones a encolar. */
export function registrarFuenteRecordatorio(fuente: FuenteRecordatorio): void {
  fuentes.set(fuente.nombre, fuente);
}

interface PostulacionBorrador {
  id: string;
  convocatoria_id: string;
  beneficiario: { usuario_id: string; nombres: string | null } | Array<{ usuario_id: string; nombres: string | null }> | null;
}

interface PostulacionCorreccion {
  id: string;
  ciclo: number;
  fecha_limite_subsanacion: string | null;
  beneficiario: PostulacionBorrador['beneficiario'];
}

function unoDe<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** RECORDATORIO_BORRADOR: borradores de convocatorias que cierran en <= RECORDATORIO_BORRADOR_DIAS dias. */
export const fuenteRecordatorioBorrador: FuenteRecordatorio = {
  nombre: 'RECORDATORIO_BORRADOR',
  async ejecutar(ahora) {
    const dias = await leerConfigInt('RECORDATORIO_BORRADOR_DIAS', 3);
    const limite = new Date(ahora.getTime() + dias * 24 * 3600 * 1000).toISOString();
    const { data: convs, error } = await supabaseAdmin
      .from('convocatoria')
      .select('id, nombre, anio, semestre, fecha_cierre_exclusiva')
      .eq('estado', 'HABILITADA')
      .gt('fecha_cierre_exclusiva', ahora.toISOString())
      .lte('fecha_cierre_exclusiva', limite);
    if (error) throw new Error(`No fue posible consultar convocatorias por cerrar: ${error.message}`);
    const salida: EncolarNotificacionInput[] = [];
    for (const c of (convs ?? []) as Array<{ id: string; nombre: string; anio: number; semestre: number; fecha_cierre_exclusiva: string }>) {
      const { data: borradores, error: errP } = await supabaseAdmin
        .from('postulacion')
        .select('id, convocatoria_id, beneficiario:beneficiario_id (usuario_id, nombres)')
        .eq('convocatoria_id', c.id)
        .eq('estado', 'BORRADOR');
      if (errP) throw new Error(`No fue posible consultar borradores: ${errP.message}`);
      const cierre = textoCierre(c.fecha_cierre_exclusiva);
      for (const p of (borradores ?? []) as unknown as PostulacionBorrador[]) {
        const ben = unoDe(p.beneficiario);
        if (!ben?.usuario_id) continue;
        salida.push({
          usuario_id: ben.usuario_id,
          tipo: 'RECORDATORIO_BORRADOR',
          titulo: 'Su postulacion en borrador esta pendiente de envio',
          mensaje: `Su postulacion a la convocatoria ${c.nombre} (${c.anio}-${c.semestre}) sigue en borrador. La convocatoria cierra el ${cierre}. Complete y envie su postulacion antes del cierre.`,
          entidad: 'POSTULACION',
          entidad_id: p.id,
          url_destino: '/beneficiario/postulaciones',
          clave_dedup: `RECORDATORIO_BORRADOR:${p.id}:${c.fecha_cierre_exclusiva}`,
          payload: { nombre: ben.nombres ?? null, convocatoria_nombre: c.nombre, fecha_cierre_texto: cierre },
        });
      }
    }
    return salida;
  },
};

async function diasHabilesEntre(desde: string, hasta: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('fn_dias_habiles_entre', { p_desde: desde, p_hasta: hasta });
  if (!error && data !== null && data !== undefined) return Number(data);
  // Sin la funcion SQL: aproximacion por dias calendario excluyendo fines de semana.
  let n = 0;
  const d = new Date(`${desde}T12:00:00-05:00`);
  const fin = new Date(`${hasta}T12:00:00-05:00`);
  while (d < fin) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) n += 1;
  }
  return n;
}

/** SUBSANACION_POR_VENCER: EN_CORRECCION con plazo a <= RECORDATORIO_SUBSANACION_DIAS_HABILES dias habiles (un aviso por ciclo). */
export const fuenteSubsanacionPorVencer: FuenteRecordatorio = {
  nombre: 'SUBSANACION_POR_VENCER',
  async ejecutar(ahora) {
    const umbral = await leerConfigInt('RECORDATORIO_SUBSANACION_DIAS_HABILES', 2);
    const { data, error } = await supabaseAdmin
      .from('postulacion')
      .select('id, ciclo, fecha_limite_subsanacion, beneficiario:beneficiario_id (usuario_id, nombres)')
      .eq('estado', 'EN_CORRECCION')
      .not('fecha_limite_subsanacion', 'is', null)
      .gte('fecha_limite_subsanacion', ahora.toISOString());
    if (error) throw new Error(`No fue posible consultar postulaciones en correccion: ${error.message}`);
    const hoy = fechaLocalBogota(ahora);
    const salida: EncolarNotificacionInput[] = [];
    for (const p of (data ?? []) as unknown as PostulacionCorreccion[]) {
      const ben = unoDe(p.beneficiario);
      if (!ben?.usuario_id || !p.fecha_limite_subsanacion) continue;
      const limiteLocal = fechaLocalBogota(new Date(p.fecha_limite_subsanacion));
      const habiles = await diasHabilesEntre(hoy, limiteLocal);
      if (habiles > umbral) continue;
      const fechaTexto = textoFecha(limiteLocal) ?? limiteLocal;
      salida.push({
        usuario_id: ben.usuario_id,
        tipo: 'SUBSANACION_POR_VENCER',
        titulo: 'Su plazo para subsanar esta por vencer',
        mensaje: `El plazo para corregir su postulacion vence el ${fechaTexto}. Si no realiza las correcciones a tiempo, la postulacion sera rechazada por vencimiento.`,
        entidad: 'POSTULACION',
        entidad_id: p.id,
        url_destino: '/beneficiario/postulaciones',
        clave_dedup: `SUBSANACION_POR_VENCER:${p.id}:${p.ciclo}`,
        payload: { nombre: ben.nombres ?? null, fecha_limite_texto: fechaTexto },
      });
    }
    return salida;
  },
};

registrarFuenteRecordatorio(fuenteRecordatorioBorrador);
registrarFuenteRecordatorio(fuenteSubsanacionPorVencer);

/** Ejecuta todas las fuentes de recordatorio; cada una es idempotente por `clave_dedup`. */
export async function ejecutarRecordatorios(ahora = new Date()): Promise<Record<string, { encoladas: number; duplicadas: number }>> {
  const resumen: Record<string, { encoladas: number; duplicadas: number }> = {};
  for (const fuente of fuentes.values()) {
    const r = { encoladas: 0, duplicadas: 0 };
    resumen[fuente.nombre] = r;
    try {
      const entradas = await fuente.ejecutar(ahora);
      for (const input of entradas) {
        try {
          const res = await encolarNotificacion(input);
          if (res.duplicada) r.duplicadas += 1;
          else r.encoladas += 1;
        } catch (e) {
          logger.error({ err: e, fuente: fuente.nombre, usuario: input.usuario_id }, 'No fue posible encolar un recordatorio');
        }
      }
    } catch (e) {
      logger.error({ err: e, fuente: fuente.nombre }, 'Fallo una fuente de recordatorios');
    }
  }
  logger.info({ resumen }, 'Recordatorios de notificaciones ejecutados');
  return resumen;
}

export async function ejecutarWorkerOutbox(): Promise<void> {
  try {
    const r = await procesarOutbox(20);
    if (r.tomados > 0) logger.info(r, 'Lote del outbox procesado');
  } catch (e) {
    logger.error({ err: e }, 'Fallo el worker del outbox');
  }
}

export async function ejecutarRecuperacionOutbox(): Promise<void> {
  try {
    const n = await recuperarAtascados(10);
    if (n > 0) logger.warn({ recuperados: n }, 'Eventos del outbox devueltos a PENDIENTE');
  } catch (e) {
    logger.error({ err: e }, 'Fallo la recuperacion del outbox');
  }
}

export async function ejecutarLimpieza(): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin.rpc('fn_notificaciones_limpiar', { p_meses: null });
    if (error) throw error;
    logger.info({ resultado: data }, 'Limpieza de notificaciones ejecutada');
  } catch (e) {
    logger.error({ err: e }, 'Fallo la limpieza mensual de notificaciones');
  }
}

/** Idempotente. No hace nada sin credenciales de Supabase ni en pruebas. */
export function iniciarJobsNotificaciones(): boolean {
  if (tareas.length > 0) return true;
  if (process.env.NODE_ENV === 'test' || !hasSupabaseCredentials()) return false;
  tareas = [
    cron.schedule('* * * * *', () => void ejecutarWorkerOutbox(), { timezone: ZONA_BOGOTA }),
    cron.schedule('*/5 * * * *', () => void ejecutarRecuperacionOutbox(), { timezone: ZONA_BOGOTA }),
    cron.schedule('0 8 * * *', () => void ejecutarRecordatorios(), { timezone: ZONA_BOGOTA }),
    cron.schedule('0 3 1 * *', () => void ejecutarLimpieza(), { timezone: ZONA_BOGOTA }),
  ];
  setTimeout(() => void ejecutarWorkerOutbox(), 5_000).unref();
  logger.info('Jobs de notificaciones iniciados (outbox cada minuto; recuperacion cada 5 min; recordatorios 08:00; limpieza mensual)');
  return true;
}

export function detenerJobsNotificaciones(): void {
  for (const t of tareas) t.stop();
  tareas = [];
}
