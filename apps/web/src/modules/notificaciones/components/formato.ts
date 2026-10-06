const fmt = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

export function textoFechaHora(valor: string | null | undefined): string {
  if (!valor) return '-';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? valor : fmt.format(d);
}
