import { z } from 'zod';

/**
 * Enums del modulo `documentos` (docs/modules/documentos.md).
 * `as const` + Zod. Se conserva el acceso `EstadoCarga.SUBIENDO` / `TipoDocumento.DOC_ID`
 * (objeto con el mismo nombre que el tipo).
 */

export const ESTADOS_CARGA = ['SUBIENDO', 'ESCANEANDO', 'DISPONIBLE', 'RECHAZADO_ARCHIVO'] as const;
export type EstadoCarga = (typeof ESTADOS_CARGA)[number];
export const EstadoCarga = {
  SUBIENDO: 'SUBIENDO',
  ESCANEANDO: 'ESCANEANDO',
  DISPONIBLE: 'DISPONIBLE',
  RECHAZADO_ARCHIVO: 'RECHAZADO_ARCHIVO',
} as const satisfies Record<EstadoCarga, EstadoCarga>;
export const EstadoCargaSchema = z.enum(ESTADOS_CARGA);

export const TIPOS_DOCUMENTO = [
  'DOC_ID',
  'DIP_BACH',
  'RES_ICFES',
  'CERT_ESC',
  'SISBEN',
  'CERT_RES',
  'LIQ_MAT',
  'PAG_CART',
  'FORM_INS',
  'CERT_NOT',
  'LAB_SOC',
  'HOR_CLA',
  'SOP_ESP',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const TipoDocumento = {
  DOC_ID: 'DOC_ID',
  DIP_BACH: 'DIP_BACH',
  RES_ICFES: 'RES_ICFES',
  CERT_ESC: 'CERT_ESC',
  SISBEN: 'SISBEN',
  CERT_RES: 'CERT_RES',
  LIQ_MAT: 'LIQ_MAT',
  PAG_CART: 'PAG_CART',
  FORM_INS: 'FORM_INS',
  CERT_NOT: 'CERT_NOT',
  LAB_SOC: 'LAB_SOC',
  HOR_CLA: 'HOR_CLA',
  SOP_ESP: 'SOP_ESP',
} as const satisfies Record<TipoDocumento, TipoDocumento>;
export const TipoDocumentoSchema = z.enum(TIPOS_DOCUMENTO);

/** Formatos oficiales a los que se vinculan FORM_INS, PAG_CART y LAB_SOC. */
export const FORMATOS_OFICIALES_DOCUMENTO = ['GE-F041', 'GE-F043', 'GE-F038'] as const;
export type FormatoOficialDocumento = (typeof FORMATOS_OFICIALES_DOCUMENTO)[number];

/** Catalogo de tipos (espejo del seed de `tipo_documento` en 0014_documentos.sql). */
export interface TipoDocumentoCatalogo {
  codigo: TipoDocumento;
  nombre: string;
  descripcion: string;
  formato_oficial: FormatoOficialDocumento | null;
}

export const CATALOGO_TIPOS_DOCUMENTO: readonly TipoDocumentoCatalogo[] = [
  { codigo: 'DOC_ID', nombre: 'Documento de identidad', descripcion: 'Cedula o tarjeta de identidad ampliada al 150 %', formato_oficial: null },
  { codigo: 'DIP_BACH', nombre: 'Diploma de bachiller o acta de grado', descripcion: 'Primera vez', formato_oficial: null },
  { codigo: 'RES_ICFES', nombre: 'Resultados Saber 11', descripcion: 'Certificado oficial del ICFES', formato_oficial: null },
  { codigo: 'CERT_ESC', nombre: 'Certificado de escolaridad', descripcion: 'Cinco anos de estudio en Tocancipa', formato_oficial: null },
  { codigo: 'SISBEN', nombre: 'Certificado SISBEN IV', descripcion: 'Consulta oficial del DNP', formato_oficial: null },
  { codigo: 'CERT_RES', nombre: 'Certificado de residencia', descripcion: 'Expedido por la Secretaria de Gobierno', formato_oficial: null },
  { codigo: 'LIQ_MAT', nombre: 'Recibo o liquidacion de matricula', descripcion: 'Periodo a cursar', formato_oficial: null },
  { codigo: 'PAG_CART', nombre: 'Pagare y carta de instrucciones firmados', descripcion: 'Formato GE-F043 firmado', formato_oficial: 'GE-F043' },
  { codigo: 'FORM_INS', nombre: 'Formulario de inscripcion firmado', descripcion: 'Formato GE-F041 firmado', formato_oficial: 'GE-F041' },
  { codigo: 'CERT_NOT', nombre: 'Certificado oficial de notas', descripcion: 'Promedio semestral y acumulado', formato_oficial: null },
  { codigo: 'LAB_SOC', nombre: 'Certificado de labor social', descripcion: 'Formato GE-F038, renovaciones', formato_oficial: 'GE-F038' },
  { codigo: 'HOR_CLA', nombre: 'Horario de clases oficial', descripcion: 'Justifica el subsidio de transporte', formato_oficial: null },
  { codigo: 'SOP_ESP', nombre: 'Soportes de linea especial', descripcion: 'Discapacidad, pertenencia etnica o victima', formato_oficial: null },
];

/** Tipos cuyo archivo debe respaldarse en un formato oficial generado y vigente. */
export const TIPOS_CON_FORMATO_GENERADO = ['FORM_INS', 'PAG_CART'] as const satisfies readonly TipoDocumento[];
/** Formato oficial exigido por cada tipo vinculado. */
export const FORMATO_POR_TIPO_DOCUMENTO = { FORM_INS: 'GE-F041', PAG_CART: 'GE-F043' } as const;

/** Formatos binarios permitidos (magic numbers verificados en el servidor). */
export const MIMES_DOCUMENTO_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type MimeDocumento = (typeof MIMES_DOCUMENTO_PERMITIDOS)[number];

/** Segundos de vigencia de la URL de lectura (documentos.md). */
export const DOCUMENTOS_URL_LECTURA_SEG = 300;

/** Estados de postulacion en los que el beneficiario puede cargar, reemplazar o eliminar soportes. */
export const ESTADOS_POSTULACION_EDITA_DOCUMENTOS = ['BORRADOR', 'EN_CORRECCION'] as const;
