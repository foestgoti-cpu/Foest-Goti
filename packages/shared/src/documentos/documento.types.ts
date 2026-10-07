import type { EstadoCarga, FormatoOficialDocumento, TipoDocumento } from './enums';

/** DTOs de respuesta del modulo documentos (contrato API <-> web). */

export interface TipoDocumentoDto {
  codigo: TipoDocumento;
  nombre: string;
  descripcion: string;
  formato_oficial: FormatoOficialDocumento | null;
}

/** Documento exigible (resultado de la regla de calculo de documentos.md). */
export interface ExigibleDto extends TipoDocumentoDto {
  obligatorio: boolean;
  beneficios_que_lo_exigen: string[];
}

export interface RequisitoMatrizDto {
  tipo_codigo: TipoDocumento;
  beneficio_codigo: string;
  tipo_tramite: 'PRIMERA_VEZ' | 'RENOVACION' | 'REINTEGRO';
  obligatorio: boolean;
}

export interface DocumentoVersionDto {
  version: number;
  estado_carga: EstadoCarga;
  nombre_original: string | null;
  mime_type: string | null;
  tamano_bytes: number | null;
  motivo_rechazo_archivo: string | null;
  motivo_reemplazo: string | null;
  formato_generado_id: string | null;
  creado_en: string;
  disponible_en: string | null;
}

export interface DocumentoDto {
  id: string;
  postulacion_id: string;
  tipo_codigo: TipoDocumento;
  tipo_nombre: string;
  /** Version vigente (la ultima DISPONIBLE; si no hay ninguna, la mas reciente). */
  version_actual: number;
  /** Estado de la version vigente. */
  estado_carga: EstadoCarga;
  nombre_original: string | null;
  mime_type: string | null;
  tamano_bytes: number | null;
  formato_generado_id: string | null;
  subido_en: string | null;
  /** Version posterior a la vigente aun en proceso (SUBIENDO, ESCANEANDO) o rechazada. */
  version_en_curso: DocumentoVersionDto | null;
  versiones: DocumentoVersionDto[];
}

export interface DocumentosPostulacionDto {
  exigibles: ExigibleDto[];
  /** Tipos de carga voluntaria que no son exigibles (SOP_ESP). */
  opcionales: TipoDocumentoDto[];
  documentos: DocumentoDto[];
  /** `true` si el beneficiario aun puede cargar, reemplazar o eliminar. */
  editable: boolean;
  /** Si no es editable, el motivo legible. */
  motivo_bloqueo: string | null;
  fecha_limite: string | null;
  /** Limites efectivos y consumo actual de la cuota. */
  limites: { max_archivo_mb: number; cuota_postulacion_mb: number; usado_bytes: number };
}

export interface UploadUrlRespuestaDto {
  documento_id: string;
  version: number;
  /**
   * Subida directa a Supabase Storage: PUT multipart con `fields` y el archivo en el campo
   * `campo_archivo`, enviando las cabeceras de `headers` (clave anon publica del proyecto).
   */
  upload: { url: string; method: 'PUT'; fields: Record<string, string>; campo_archivo: string; headers: Record<string, string> };
  expira_en: string;
}

export interface ConfirmarRespuestaDto {
  documento_id: string;
  version: number;
  estado_carga: EstadoCarga;
}

export interface UrlLecturaDto {
  url: string;
  expira_en: string;
  mime_type: string | null;
  nombre_original: string | null;
}

/** Faltante de documentos para validacion/envio de postulaciones. */
export interface DocumentoFaltanteDto {
  tipo: TipoDocumento;
  obligatorio: boolean;
  estado: 'SIN_CARGAR' | EstadoCarga;
}
