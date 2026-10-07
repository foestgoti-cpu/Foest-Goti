export type {
  ConfirmarRespuestaDto,
  DocumentoDto,
  DocumentoVersionDto,
  DocumentosPostulacionDto,
  EstadoCarga,
  ExigibleDto,
  TipoDocumento,
  TipoDocumentoDto,
  UploadUrlDto,
  UploadUrlRespuestaDto,
  UrlLecturaDto,
} from '@foest/shared';

/** Fases del flujo de carga (reserva, subida directa, confirmacion y verificacion antivirus). */
export type FaseCarga = 'inactivo' | 'reservando' | 'subiendo' | 'confirmando' | 'verificando' | 'listo' | 'error';

/** Situacion de un tipo exigible frente a lo cargado. */
export type SituacionDocumento = 'SIN_CARGAR' | 'SUBIENDO' | 'ESCANEANDO' | 'DISPONIBLE' | 'RECHAZADO_ARCHIVO';
