import { z } from 'zod';

/**
 * Enums del modulo `export_reports` (docs/modules/export_reports.md).
 * `as const` + Zod, mismo patron que `enums.ts` (sin `enum` de TypeScript).
 */

export const TIPOS_REPORTE = ['RESUMEN_PDF', 'CONSOLIDADO_XLSX', 'CONSOLIDADO_CSV'] as const;
export const TipoReporteSchema = z.enum(TIPOS_REPORTE);
export type TipoReporte = z.infer<typeof TipoReporteSchema>;
export const TipoReporte = {
  RESUMEN_PDF: 'RESUMEN_PDF',
  CONSOLIDADO_XLSX: 'CONSOLIDADO_XLSX',
  CONSOLIDADO_CSV: 'CONSOLIDADO_CSV',
} as const satisfies Record<TipoReporte, TipoReporte>;

export const ESTADOS_REPORTE = ['COLA', 'PROCESANDO', 'LISTO', 'FALLIDO', 'EXPIRADO'] as const;
export const EstadoReporteSchema = z.enum(ESTADOS_REPORTE);
export type EstadoReporte = z.infer<typeof EstadoReporteSchema>;
export const EstadoReporte = {
  COLA: 'COLA',
  PROCESANDO: 'PROCESANDO',
  LISTO: 'LISTO',
  FALLIDO: 'FALLIDO',
  EXPIRADO: 'EXPIRADO',
} as const satisfies Record<EstadoReporte, EstadoReporte>;

/** Estados en los que el reporte aun esta en curso (impiden una solicitud identica). */
export const ESTADOS_REPORTE_EN_CURSO: readonly EstadoReporte[] = ['COLA', 'PROCESANDO'];

export const FORMATOS_CONSOLIDADO = ['XLSX', 'CSV'] as const;
export const FormatoConsolidadoSchema = z.enum(FORMATOS_CONSOLIDADO);
export type FormatoConsolidado = z.infer<typeof FormatoConsolidadoSchema>;
export const FormatoConsolidado = { XLSX: 'XLSX', CSV: 'CSV' } as const satisfies Record<FormatoConsolidado, FormatoConsolidado>;

export const TIPO_REPORTE_POR_FORMATO: Readonly<Record<FormatoConsolidado, TipoReporte>> = {
  XLSX: 'CONSOLIDADO_XLSX',
  CSV: 'CONSOLIDADO_CSV',
};

/** Permiso adicional que habilita las columnas sensibles (estrato, SISBEN, documento). */
export const PERMISO_EXPORTAR_SENSIBLE = 'reportes:exportar_sensible' as const;
