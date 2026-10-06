/** Presentacion de fechas de la bitacora: `registrado_en` es UTC; la UI muestra America/Bogota. */
const ZONA = 'America/Bogota';

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'medium', timeZone: ZONA }).format(d);
}

export function numero(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CO').format(n);
}
