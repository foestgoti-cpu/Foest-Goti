/** Utilidades de presentacion del modulo (fechas y moneda en espanol de Colombia). */

export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' });
}

/** Ultimo dia habilitado (fecha_cierre_exclusiva - 1 ms) en formato legible. */
export function cierrePresentado(fechaCierreExclusiva: string | null | undefined): string {
  if (!fechaCierreExclusiva) return '-';
  const t = new Date(fechaCierreExclusiva).getTime();
  if (Number.isNaN(t)) return '-';
  return new Date(t - 1).toLocaleDateString('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' });
}

export function pesos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '-';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);
}

export const TEXTO_TIPO_SOLICITUD: Record<string, string> = {
  PRIMERA_VEZ: 'Primera vez',
  RENOVACION: 'Renovacion',
  REINTEGRO: 'Reintegro',
};

export const TEXTO_SITUACION_LABORAL: Record<string, string> = {
  EMPLEADO: 'Empleado(a)',
  INDEPENDIENTE: 'Independiente',
  DESEMPLEADO: 'Desempleado(a)',
  SOLO_ESTUDIA: 'Solo estudia',
};

export const TEXTO_MODALIDAD: Record<string, string> = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  DISTANCIA: 'A distancia',
  HIBRIDA: 'Hibrida',
};

export const TEXTO_TIPO_PAGO: Record<string, string> = {
  CUENTA_BANCARIA: 'Cuenta bancaria',
  BILLETERA: 'Billetera digital',
};
