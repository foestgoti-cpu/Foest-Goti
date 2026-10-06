import type { EstadoConvocatoria } from '@foest/shared';
import { ApiRequestError } from '../../lib/api';

export const ETIQUETA_ESTADO: Record<EstadoConvocatoria, string> = {
  BORRADOR: 'Borrador',
  HABILITADA: 'Habilitada',
  SUSPENDIDA: 'Suspendida',
  CERRADA: 'Cerrada',
  ARCHIVADA: 'Archivada',
};

export const ETIQUETA_ORIGEN: Record<'ADMIN' | 'CRON' | 'TIEMPO_REAL', string> = {
  ADMIN: 'Administrador',
  CRON: 'Sistema (tarea programada)',
  TIEMPO_REAL: 'Sistema (calculo en tiempo real)',
};

export const ETIQUETA_TIPO_AMPLIACION = { PRORROGA: 'Prorroga', REAPERTURA: 'Reapertura' } as const;

const fmtFechaLocal = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'long', year: 'numeric' });
const fmtFechaHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const fmtMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** `YYYY-MM-DD` -> "31 de marzo de 2026" (sin desfase de zona). */
export function formatearFechaLocal(fecha: string | null | undefined): string {
  if (!fecha) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return fecha;
  return fmtFechaLocal.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)));
}

/** Instante ISO -> fecha y hora en America/Bogota. */
export function formatearFechaHora(iso: string | null | undefined): string {
  if (!iso) return '-';
  return fmtFechaHora.format(new Date(iso));
}

/** Instante exclusivo de cierre -> ultimo dia habilitado (YYYY-MM-DD en America/Bogota). */
export function fechaCierreDesdeExclusiva(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 1);
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return partes;
}

export function formatearMoneda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '-';
  return fmtMoneda.format(valor);
}

export function periodo(anio: number, semestre: number): string {
  return `${anio}-${semestre}`;
}

export function textoDiasRestantes(dias: number): string {
  if (dias <= 0) return 'Cerrada';
  if (dias === 1) return 'Cierra hoy';
  return `${dias} dias restantes`;
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof ApiRequestError) {
    const detalles = Array.isArray(e.details) ? (e.details as Array<{ path?: string; message?: string }>) : [];
    const lista = detalles.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).filter(Boolean).join('; ');
    return lista ? `${e.message} (${lista})` : e.message;
  }
  if (e instanceof Error) return e.message;
  return 'Ocurrio un error inesperado';
}

export function codigoDeError(e: unknown): string | null {
  return e instanceof ApiRequestError ? e.code : null;
}

export function detallesDeError(e: unknown): unknown {
  return e instanceof ApiRequestError ? e.details : undefined;
}
