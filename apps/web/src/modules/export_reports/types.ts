import type { EstadoReporte, TipoReporte } from '@foest/shared';

/** Tipos solo de UI; los DTO viven en @foest/shared. */
export const TEXTO_ESTADO_REPORTE: Record<EstadoReporte, string> = {
  COLA: 'En cola',
  PROCESANDO: 'Procesando',
  LISTO: 'Listo',
  FALLIDO: 'Fallido',
  EXPIRADO: 'Expirado',
};

export const TEXTO_TIPO_REPORTE: Record<TipoReporte, string> = {
  RESUMEN_PDF: 'Resumen PDF',
  CONSOLIDADO_HTML: 'Consolidado HTML',
  CONSOLIDADO_CSV: 'Consolidado CSV',
  CONSOLIDADO_XLSX: 'Consolidado XLSX (histórico)',
};

export const INTERVALO_SONDEO_MS = 4000;
