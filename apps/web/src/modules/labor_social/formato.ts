import { ApiRequestError } from '../../lib/api';

/** Horas con coma decimal y dos decimales (es-CO). */
export function horas(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '-';
  return valor.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** YYYY-MM-DD -> dd/mm/aaaa (sin pasar por Date: evita corrimientos de zona horaria). */
export function fechaDia(iso: string | null | undefined): string {
  if (!iso) return '-';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
}

/** Fecha de hoy en America/Bogota (YYYY-MM-DD), para limitar el selector de fecha. */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function mensajeError(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Ocurrió un error inesperado; intente de nuevo.';
}
