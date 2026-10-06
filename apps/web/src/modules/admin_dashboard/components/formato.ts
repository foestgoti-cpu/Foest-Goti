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

export function numero(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CO').format(n);
}

export function moneda(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export const ETIQUETA_ESTADO_POSTULACION: Record<string, string> = {
  BORRADOR: 'Borrador',
  PENDIENTE: 'Pendiente',
  EN_EVALUACION: 'En evaluacion',
  EN_CORRECCION: 'En correccion',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  DESISTIDA: 'Desistida',
};

export const ETIQUETA_ESTADO_CONVOCATORIA: Record<string, string> = {
  BORRADOR: 'Borrador',
  HABILITADA: 'Habilitada',
  SUSPENDIDA: 'Suspendida',
  CERRADA: 'Cerrada',
  ARCHIVADA: 'Archivada',
};

export const ETIQUETA_ROL: Record<string, string> = {
  ADMINISTRADOR: 'Administradores',
  FUNCIONARIO: 'Funcionarios',
  BENEFICIARIO: 'Beneficiarios',
};

export function etiqueta(mapa: Record<string, string>, clave: string): string {
  return mapa[clave] ?? clave;
}
