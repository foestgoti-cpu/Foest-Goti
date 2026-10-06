import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { CamposCalculados, ConvocatoriaRow } from './convocatorias.types';

/**
 * Unico helper de fechas del modulo (convocatorias.md, "Cierre exclusivo y zona horaria").
 * El cliente envia solo fechas locales `YYYY-MM-DD`; el servidor calcula el instante.
 */
export const ZONA_HORARIA = 'America/Bogota';

const RE_FECHA_LOCAL = /^(\d{4})-(\d{2})-(\d{2})$/;

function partesFecha(fechaLocal: string): { anio: number; mes: number; dia: number } {
  const m = RE_FECHA_LOCAL.exec(fechaLocal);
  if (!m) throw new Error(`Fecha local invalida: ${fechaLocal}`);
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

/** Suma `dias` a una fecha local `YYYY-MM-DD` (aritmetica de calendario, sin zona). */
export function sumarDiasLocal(fechaLocal: string, dias: number): string {
  const { anio, mes, dia } = partesFecha(fechaLocal);
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return d.toISOString().slice(0, 10);
}

/** Instante de las 00:00:00 `America/Bogota` del dia indicado. */
export function inicioDiaLocal(fechaLocal: string): Date {
  partesFecha(fechaLocal); // valida formato
  return fromZonedTime(`${fechaLocal}T00:00:00`, ZONA_HORARIA);
}

/**
 * `fecha_cierre_exclusiva` = 00:00 `America/Bogota` del dia siguiente al cierre presentado.
 * La condicion de cierre es `now >= fecha_cierre_exclusiva`.
 */
export function cierreExclusivoDesdeFechaLocal(fechaCierreLocal: string): Date {
  return inicioDiaLocal(sumarDiasLocal(fechaCierreLocal, 1));
}

/** Fecha local `YYYY-MM-DD` de un instante en `America/Bogota`. */
export function fechaLocalDe(instante: Date | string): string {
  return formatInTimeZone(new Date(instante), ZONA_HORARIA, 'yyyy-MM-dd');
}

/** Fecha de cierre presentada (ultimo dia habilitado) a partir del instante exclusivo. */
export function fechaCierrePresentada(fechaCierreExclusiva: Date | string): string {
  const exclusiva = new Date(fechaCierreExclusiva).getTime();
  return fechaLocalDe(new Date(exclusiva - 1));
}

/** Instante de las 23:59:59 locales del ultimo dia (para presentacion). */
export function instanteCierrePresentado(fechaCierreExclusiva: Date | string): string {
  const exclusiva = new Date(fechaCierreExclusiva).getTime();
  return new Date(exclusiva - 1000).toISOString();
}

export function diasRestantes(fechaCierreExclusiva: Date | string, ahora: Date = new Date()): number {
  const ms = new Date(fechaCierreExclusiva).getTime() - ahora.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/** Estado operativo "abierta" calculado en tiempo real (DECISIONES section 5). */
export function estaAbierta(
  c: Pick<ConvocatoriaRow, 'estado' | 'fecha_apertura' | 'fecha_cierre_exclusiva'>,
  ahora: Date = new Date(),
): boolean {
  if (c.estado !== 'HABILITADA') return false;
  const t = ahora.getTime();
  return new Date(c.fecha_apertura).getTime() <= t && t < new Date(c.fecha_cierre_exclusiva).getTime();
}

/** `true` si el plazo ya vencio (independiente del estado). */
export function plazoVencido(c: Pick<ConvocatoriaRow, 'fecha_cierre_exclusiva'>, ahora: Date = new Date()): boolean {
  return ahora.getTime() >= new Date(c.fecha_cierre_exclusiva).getTime();
}

export function camposCalculados(
  c: Pick<ConvocatoriaRow, 'estado' | 'fecha_apertura' | 'fecha_cierre_exclusiva'>,
  ahora: Date = new Date(),
): CamposCalculados {
  return {
    abierta: estaAbierta(c, ahora),
    fecha_cierre: fechaCierrePresentada(c.fecha_cierre_exclusiva),
    fecha_apertura_local: fechaLocalDe(c.fecha_apertura),
    dias_restantes: diasRestantes(c.fecha_cierre_exclusiva, ahora),
  };
}
