/**
 * Catalogo de claves de configuracion del sistema (catalogos_configuracion.md).
 * Fuente unica para API y web; el seed vive en 0001_base.sql / 0009 y en
 * apps/api/src/modules/catalogos_configuracion/configuracion.defaults.ts.
 */
export const CLAVES_CONFIGURACION = [
  'ACUERDO_VIGENTE_CODIGO',
  'ACUERDO_VIGENTE_TEXTO',
  'MAX_TAMANO_ARCHIVO_MB',
  'CUOTA_POSTULACION_MB',
  'SUBSANACION_DIAS_HABILES',
  'SUBSANACION_DIAS_HABILES_MAX',
  'ALERTA_CIERRE_DIAS',
  'ALERTA_SOBRECARGA_PENDIENTES',
  'ALERTA_SOBRECARGA_DIAS_HABILES',
  'ALERTA_ASIGNACION_SIN_MOVIMIENTO_DIAS_HABILES',
  'ALERTA_POOL_DIAS_HABILES',
  'ALERTA_SUBSANACION_DIAS_HABILES',
  'ALERTA_CUPO_AVISO_PCT',
  'ALERTA_TRABAJOS_HORAS',
  'KANON_UMBRAL',
  'SESIONES_MAX',
  'RECORDATORIO_BORRADOR_DIAS',
  'RECORDATORIO_SUBSANACION_DIAS_HABILES',
  'FECHA_PROXIMA_APERTURA_ESTIMADA',
  'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE',
  'CONSENTIMIENTO_TEXTO',
  'PAGARE_REQUIERE_CODEUDOR_MENORES',
  'RETENCION_DOCUMENTOS_ANIOS',
  'RETENCION_AUDITORIA_ANIOS',
  'RETENCION_NOTIFICACIONES_MESES',
  'LABOR_SOCIAL_HORAS_MINIMAS',
  'LABOR_SOCIAL_HORAS_MAX_DIA',
  'AMPLIACION_MOTIVO_MIN_CARACTERES',
  'PERFIL_EDAD_MAYORIA',
  'REGISTRO_VERIFICACION_EMAIL_HORAS',
  'NOTIF_REINTENTOS_MAX',
  'BLOQUEAR_ENVIO_SIN_TEXTO_OFICIAL',
  'ALERTA_PRESUPUESTO_PORCENTAJE',
  'ELEGIBILIDAD_RENOVACION_ESTADOS',
  'ELEGIBILIDAD_REINTEGRO_PERIODOS_SIN_APOYO_MIN',
  'ELEGIBILIDAD_REINTEGRO_EXCLUYE_REVOCADOS',
  'REPORTE_UMBRAL_SINCRONO',
  'REPORTE_RETENCION_HORAS',
] as const;
export type ClaveConfiguracion = (typeof CLAVES_CONFIGURACION)[number];

export const TIPOS_CONFIGURACION = ['INT', 'STRING', 'BOOL', 'TEXT', 'DATE', 'JSON'] as const;
export type TipoConfiguracion = (typeof TIPOS_CONFIGURACION)[number];

export const CATEGORIAS_CONFIGURACION = [
  'ACUERDO',
  'DOCUMENTOS',
  'PLAZOS',
  'ALERTAS',
  'SEGURIDAD',
  'PRIVACIDAD',
  'JURIDICO',
  'LABOR_SOCIAL',
  'NOTIFICACIONES',
] as const;
export type CategoriaConfiguracion = (typeof CATEGORIAS_CONFIGURACION)[number];

/** Categorias cuyo cambio exige `confirmar: true` (doble intencion). */
export const CATEGORIAS_CON_CONFIRMACION: readonly CategoriaConfiguracion[] = ['JURIDICO', 'SEGURIDAD', 'DOCUMENTOS'];

/** Claves que no se editan con PUT: se alimentan al publicar versiones. */
export const CLAVES_NO_EDITABLES: readonly ClaveConfiguracion[] = ['CONSENTIMIENTO_TEXTO_VERSION_VIGENTE', 'CONSENTIMIENTO_TEXTO'];

/** Subconjunto no sensible expuesto en GET /configuracion/publica. */
export const CLAVES_CONFIGURACION_PUBLICA: readonly ClaveConfiguracion[] = [
  'ACUERDO_VIGENTE_CODIGO',
  'ACUERDO_VIGENTE_TEXTO',
  'MAX_TAMANO_ARCHIVO_MB',
  'CUOTA_POSTULACION_MB',
  'FECHA_PROXIMA_APERTURA_ESTIMADA',
  'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE',
  'SUBSANACION_DIAS_HABILES',
];

/** Fila de configuracion_sistema tal como se expone al administrador. */
export interface ConfiguracionItem {
  clave: string;
  valor: string | null;
  tipo: TipoConfiguracion;
  categoria: CategoriaConfiguracion;
  descripcion: string;
  valor_defecto: string | null;
  valor_min: string | null;
  valor_max: string | null;
  pendiente_confirmar: boolean;
  version: number;
  actualizado_por: string | null;
  actualizado_en: string;
}

export interface FestivoItem {
  id: string;
  fecha: string;
  nombre: string;
  anio: number;
  creado_por: string | null;
  creado_en: string;
}
