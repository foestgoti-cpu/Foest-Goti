import type { PostgrestError } from '@supabase/supabase-js';
import { AppError } from '../../shared';

/**
 * Utilidades de acceso a tablas que pertenecen a modulos que se construyen en
 * paralelo (documento, revision, otorgamiento, formato_generado, ...).
 * Si la tabla aun no existe, la consulta se trata como "modulo pendiente" y el
 * dashboard devuelve la seccion vacia con `pendiente_modulo: true` (nunca 500).
 */

/** PostgREST: `42P01` relacion inexistente; `PGRST205` tabla no esta en el cache del esquema; `42703` columna inexistente. */
export function esTablaInexistente(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703') return true;
  const msg = (error.message ?? '').toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache') ||
    msg.includes('no existe')
  );
}

export interface ResultadoOpcional<T> {
  data: T[];
  /** `true` si la tabla del modulo no existe todavia. */
  pendiente: boolean;
}

/**
 * Ejecuta una consulta sobre una tabla opcional. Devuelve `{ data: [], pendiente: true }`
 * si la tabla no existe; lanza 500 ante cualquier otro error.
 */
export async function consultaOpcional<T>(
  descripcion: string,
  consulta: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<ResultadoOpcional<T>> {
  const { data, error } = await consulta;
  if (error) {
    if (esTablaInexistente(error)) return { data: [], pendiente: true };
    throw AppError.interno(`No fue posible consultar ${descripcion}: ${error.message}`);
  }
  return { data: data ?? [], pendiente: false };
}

/** Ejecuta una consulta obligatoria (tabla de 0001_base.sql). Lanza 500 ante error. */
export async function consultaObligatoria<T>(
  descripcion: string,
  consulta: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const { data, error } = await consulta;
  if (error) throw AppError.interno(`No fue posible consultar ${descripcion}: ${error.message}`);
  return data ?? [];
}

/* ------------------------- Fechas en America/Bogota ------------------------- */

export const ZONA_BOGOTA = 'America/Bogota';
const MS_DIA = 24 * 60 * 60 * 1000;

const fmtFechaHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_BOGOTA,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const fmtFecha = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_BOGOTA,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function textoFechaHora(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return fmtFechaHora.format(d);
}

export function textoFecha(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  // Fechas `YYYY-MM-DD` se interpretan como dia local de Bogota (no UTC) para no restar un dia.
  const d = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00-05:00`) : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return fmtFecha.format(d);
}

/** Cierre presentado: un segundo antes del instante exclusivo (23:59:59 del dia de cierre en Bogota). */
export function textoCierre(fechaCierreExclusiva: string): string {
  const d = new Date(new Date(fechaCierreExclusiva).getTime() - 1000);
  return fmtFechaHora.format(d);
}

/** Dias (fraccion hacia arriba) entre `ahora` y `fecha`; negativo si ya paso. */
export function diasHasta(fecha: string | Date, ahora: Date): number {
  const f = fecha instanceof Date ? fecha : new Date(fecha);
  return Math.ceil((f.getTime() - ahora.getTime()) / MS_DIA);
}

export function estaAbierta(c: { estado: string; fecha_apertura: string; fecha_cierre_exclusiva: string }, ahora: Date): boolean {
  return c.estado === 'HABILITADA' && new Date(c.fecha_apertura) <= ahora && ahora < new Date(c.fecha_cierre_exclusiva);
}
