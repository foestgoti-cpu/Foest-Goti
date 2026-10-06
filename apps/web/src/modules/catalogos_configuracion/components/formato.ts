/** Utilidades de presentacion (America/Bogota, es-CO). */
const ZONA = 'America/Bogota';

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA }).format(d);
}

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Fechas YYYY-MM-DD se muestran tal cual para no desplazar el dia por zona horaria
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: ZONA }).format(d);
}

export function mensajeDeError(e: unknown, defecto: string): string {
  return e instanceof Error && e.message ? e.message : defecto;
}
