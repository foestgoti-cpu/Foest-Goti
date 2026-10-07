import type { EstadoCarga, Rol, TipoDocumento, TipoSolicitud } from '@foest/shared';

/** Filas de BD del modulo (0014_documentos.sql). */

export interface TipoDocumentoRow {
  id: string;
  codigo: TipoDocumento;
  nombre: string;
  descripcion: string;
  formato_oficial: 'GE-F041' | 'GE-F043' | 'GE-F038' | null;
}

export interface RequisitoRow {
  tipo_id: string;
  beneficio_codigo: string;
  tipo_tramite: TipoSolicitud;
  obligatorio: boolean;
}

export interface DocumentoRow {
  id: string;
  postulacion_id: string;
  tipo_id: string;
  version_actual: number;
  estado_carga: EstadoCarga;
  storage_key: string | null;
  nombre_original: string | null;
  mime_type: string | null;
  tamano_bytes: number | null;
  sha256: string | null;
  formato_generado_id: string | null;
  subido_en: string | null;
  eliminado: boolean;
  eliminado_en: string | null;
  eliminado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface DocumentoVersionRow {
  id: string;
  documento_id: string;
  version: number;
  storage_key: string;
  nombre_original: string | null;
  mime_type: string | null;
  tamano_bytes: number | null;
  sha256: string | null;
  estado_carga: EstadoCarga;
  motivo_rechazo_archivo: string | null;
  formato_generado_id: string | null;
  motivo_reemplazo: string | null;
  escaneo: 'LIMPIO' | 'OMITIDO' | null;
  creado_en: string;
  disponible_en: string | null;
}

/** Datos minimos de la postulacion que usa este modulo (solo lectura). */
export interface PostulacionDocumentos {
  id: string;
  beneficiario_id: string;
  convocatoria_id: string;
  tipo_solicitud: TipoSolicitud;
  estado: string;
  fecha_limite_subsanacion: string | null;
  ciclo: number;
}

/** Quien solicita (alcance y auditoria). */
export interface SolicitanteDocumento {
  id: string;
  rol: Rol;
}

export interface ExigibleCalculado {
  tipo_id: string;
  tipo_codigo: TipoDocumento;
  obligatorio: boolean;
  beneficios_que_lo_exigen: string[];
}
