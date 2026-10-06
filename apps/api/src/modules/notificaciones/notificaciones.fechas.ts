/** Formato de fechas en `America/Bogota` para textos de buzon y correo ("15 de marzo de 2026, 11:59 p. m."). */

export const ZONA_BOGOTA = 'America/Bogota';

const fmtFechaHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_BOGOTA,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const fmtFecha = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_BOGOTA, day: 'numeric', month: 'long', year: 'numeric' });

const fmtIsoLocal = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_BOGOTA, year: 'numeric', month: '2-digit', day: '2-digit' });

export function textoFechaHora(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return fmtFechaHora.format(d);
}

export function textoFecha(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  const d = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00-05:00`) : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return fmtFecha.format(d);
}

/** Fecha local `YYYY-MM-DD` de un instante en Bogota. */
export function fechaLocalBogota(instante: Date): string {
  return fmtIsoLocal.format(instante);
}

/** Cierre presentado: un segundo antes del instante exclusivo. */
export function textoCierre(fechaCierreExclusiva: string): string {
  return fmtFechaHora.format(new Date(new Date(fechaCierreExclusiva).getTime() - 1000));
}
