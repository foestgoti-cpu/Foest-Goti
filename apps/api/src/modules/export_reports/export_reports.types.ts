import type { EstadoReporte, FiltrosConsolidado, TipoReporte } from '@foest/shared';

export const BUCKET_REPORTES = 'reportes';
export const SEGUNDOS_URL_DESCARGA = 120;
export const UMBRAL_SINCRONO_DEFECTO = 200;
export const RETENCION_HORAS_DEFECTO = 24;

/** Fila de `reporte_generado` (0020). */
export interface ReporteRow {
  id: string;
  usuario_id: string;
  tipo: TipoReporte;
  convocatoria_id: string | null;
  parametros: { formato?: string; filtros?: FiltrosConsolidado } & Record<string, unknown>;
  huella_parametros: string;
  estado: EstadoReporte;
  incluye_sensibles: boolean;
  filas_total: number | null;
  storage_key: string | null;
  nombre_archivo: string | null;
  sha256: string | null;
  tamano_bytes: number | null;
  intentos: number;
  error: string | null;
  expira_en: string | null;
  notificado_en: string | null;
  creado_en: string;
  iniciado_en: string | null;
  finalizado_en: string | null;
  actualizado_en: string;
}

/** Codigos de error genericos persistidos en `reporte_generado.error` (sin datos personales). */
export const ERRORES_REPORTE = {
  SIN_ALCANCE: 'SIN_ALCANCE',
  ERROR_GENERACION: 'ERROR_GENERACION',
  ERROR_ALMACENAMIENTO: 'ERROR_ALMACENAMIENTO',
  TIMEOUT: 'TIMEOUT',
} as const;

// ----------------------------- Columnas del consolidado -----------------------------

export type TipoColumna = 'TEXTO' | 'ENTERO' | 'DECIMAL' | 'MONEDA' | 'FECHA' | 'TELEFONO';

/** Valor tipado de una celda: el escritor decide la representacion segun `TipoColumna`. */
export type ValorCelda = string | number | Date | null;

export interface ColumnaConsolidado {
  clave: string;
  titulo: string;
  tipo: TipoColumna;
  /** true: solo se exporta con el permiso `reportes:exportar_sensible`. */
  sensible: boolean;
  ancho: number;
}

export type FilaConsolidado = Record<string, ValorCelda>;

export interface ResumenConsolidado {
  total: number;
  por_estado: Record<string, number>;
  por_tipo_solicitud: Record<string, number>;
  por_beneficio: Record<string, { solicitados: number; aprobados: number }>;
  monto_aprobado_total: number;
}

export interface ArchivoGenerado {
  buffer: Buffer;
  contentType: string;
  extension: 'xlsx' | 'csv' | 'pdf';
}
