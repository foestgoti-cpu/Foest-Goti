/**
 * Sello "Datos actualizados a las hh:mm:ss" (hora de Bogota) a partir del minimo de
 * `refrescada_en` de las vistas materializadas (metricas_refresh).
 */
export function formatearHoraBogota(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '--:--:--';
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Bogota',
  }).format(fecha);
}

export function formatearFechaBogota(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' }).format(fecha);
}

export function SelloActualizacion({ actualizadoEn, className }: { actualizadoEn: string | null | undefined; className?: string }) {
  if (!actualizadoEn) {
    return (
      <p className={className} aria-live="polite">
        Datos aun no actualizados: las vistas de metricas no se han refrescado todavia.
      </p>
    );
  }
  const hoy = formatearFechaBogota(new Date().toISOString());
  const dia = formatearFechaBogota(actualizadoEn);
  return (
    <p className={className} aria-live="polite">
      Datos actualizados a las <time dateTime={actualizadoEn}>{formatearHoraBogota(actualizadoEn)}</time>
      {dia && dia !== hoy ? ` del ${dia}` : ''} (hora de Colombia). Se refrescan cada 5 minutos.
    </p>
  );
}
