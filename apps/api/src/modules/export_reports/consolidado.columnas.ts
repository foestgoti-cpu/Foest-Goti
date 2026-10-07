import type { ColumnaConsolidado } from './export_reports.types';

/**
 * Lista blanca y tipado de columnas del consolidado. Agregar columnas exige cambio de codigo.
 * Nunca se exportan datos de pago completos (solo ultimos 4 digitos), hashes, tokens, claves de
 * almacenamiento ni observaciones internas con nombre del evaluador.
 */
const c = (clave: string, titulo: string, tipo: ColumnaConsolidado['tipo'], ancho: number, sensible = false): ColumnaConsolidado => ({
  clave,
  titulo,
  tipo,
  sensible,
  ancho,
});

export const COLUMNAS_CONSOLIDADO: readonly ColumnaConsolidado[] = [
  c('codigo_expediente', 'Código del expediente', 'TEXTO', 24),
  c('convocatoria', 'Convocatoria', 'TEXTO', 28),
  c('tipo_solicitud', 'Tipo de trámite', 'TEXTO', 16),
  c('estado', 'Estado', 'TEXTO', 16),
  c('ciclo', 'Ciclo', 'ENTERO', 8),
  c('beneficiario', 'Beneficiario', 'TEXTO', 32),
  c('correo', 'Correo electrónico', 'TEXTO', 32),
  c('telefono', 'Teléfono', 'TELEFONO', 16),
  c('institucion', 'Institución', 'TEXTO', 30),
  c('programa', 'Programa', 'TEXTO', 30),
  c('semestre', 'Semestre', 'ENTERO', 10),
  c('beneficios_solicitados', 'Beneficios solicitados', 'TEXTO', 28),
  c('beneficios_aprobados', 'Beneficios aprobados', 'TEXTO', 28),
  c('beneficios_rechazados', 'Beneficios rechazados', 'TEXTO', 28),
  c('monto_aprobado', 'Monto aprobado (COP)', 'MONEDA', 18),
  c('horas_labor_social', 'Horas de labor social', 'DECIMAL', 14),
  c('fecha_envio', 'Fecha de envío', 'FECHA', 14),
  c('fecha_dictamen', 'Fecha de dictamen', 'FECHA', 16),
  c('tipo_documento', 'Tipo de documento', 'TEXTO', 14, true),
  c('numero_documento', 'Número de documento', 'TEXTO', 20, true),
  c('estrato', 'Estrato', 'ENTERO', 10, true),
  c('sisben_categoria', 'Categoría SISBEN', 'TEXTO', 16, true),
  c('sisben_puntaje', 'Puntaje SISBEN', 'DECIMAL', 14, true),
  c('pago_ultimos4', 'Medio de pago (últimos 4 dígitos)', 'TEXTO', 16, true),
];

export function columnasPara(incluirSensibles: boolean): ColumnaConsolidado[] {
  return COLUMNAS_CONSOLIDADO.filter((col) => incluirSensibles || !col.sensible);
}
