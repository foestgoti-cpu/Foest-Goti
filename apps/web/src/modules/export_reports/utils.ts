import { ApiRequestError } from '../../lib/api';

export function mensajeReporte(e: unknown): string {
  if (e instanceof ApiRequestError) {
    if (e.code === 'REPORTE_EN_CURSO') return 'Ya existe un reporte identico en curso. Espere a que termine antes de solicitar otro.';
    if (e.code === 'REPORTE_EXPIRADO' || e.status === 410) return 'El archivo de este reporte ya expiro y fue eliminado. Solicite uno nuevo.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Ocurrio un error inesperado';
}

export function formatearBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function guardarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
