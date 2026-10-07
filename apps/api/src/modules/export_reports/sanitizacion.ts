import type { ValorCelda } from './export_reports.types';

/**
 * Sanitizacion contra inyeccion de formulas (docs/modules/export_reports.md).
 * - CSV: SOLO las celdas de TEXTO que (tras quitar espacios iniciales) empiezan con = + - @ tab o CR
 *   se prefijan con una comilla simple. Los numeros, monedas y fechas se escriben tipados y no se prefijan.
 * - Telefonos: texto de solo digitos con prefijo de pais y sin `+` inicial.
 */

const INICIOS_PELIGROSOS = new Set(['=', '+', '-', '@', '\t', '\r']);

export function sanitizarTextoCsv(valor: string): string {
  const sinEspacios = valor.replace(/^ +/, '');
  if (sinEspacios.length > 0 && INICIOS_PELIGROSOS.has(sinEspacios[0] as string)) return `'${valor}`;
  return valor;
}

/** Solo digitos con prefijo de pais (57 para celulares colombianos de 10 digitos); null si no es normalizable. */
export function normalizarTelefono(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.replace(/[\s+\-().]/g, '');
  if (!/^\d{7,15}$/.test(limpio)) return null;
  if (/^3\d{9}$/.test(limpio)) return `57${limpio}`;
  return limpio;
}

/** Fecha local (YYYY-MM-DD) como Date a medianoche UTC: se representa igual en cualquier zona. */
export function fechaLocalADate(ymd: string | null): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const FORMATO_BOGOTA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Instante ISO -> Date (medianoche UTC) del dia calendario en America/Bogota. */
export function instanteADiaBogota(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return fechaLocalADate(FORMATO_BOGOTA.format(t));
}

export function dateAYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Texto plano sin caracteres de control no permitidos en XML/CSV. */
export function limpiarTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  // eslint-disable-next-line no-control-regex
  const s = String(valor).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return s.length === 0 ? null : s;
}

export function esNumeroValido(v: ValorCelda | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
