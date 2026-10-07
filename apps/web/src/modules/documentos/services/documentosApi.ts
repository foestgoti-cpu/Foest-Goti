import type { ListadoFormatosDto, RequisitosQueryDto } from '@foest/shared';
import { api } from '../../../lib/api';
import type {
  ConfirmarRespuestaDto,
  DocumentoDto,
  DocumentosPostulacionDto,
  ExigibleDto,
  TipoDocumentoDto,
  UploadUrlDto,
  UploadUrlRespuestaDto,
  UrlLecturaDto,
} from '../types';

/** Cliente HTTP del modulo (envuelve `api` de lib/api.ts, que adjunta el Bearer). */
export const documentosApi = {
  /** Exigibles y documentos cargados de una postulacion. */
  listar: (postulacionId: string) => api.get<DocumentosPostulacionDto>(`/postulaciones/${postulacionId}/documentos`),

  /** Metadatos y estado de carga (sondeo del escaneo). */
  obtener: (documentoId: string) => api.get<DocumentoDto>(`/documentos/${documentoId}`),

  /** Reserva el documento (o una nueva version) y devuelve la URL de subida directa. */
  solicitarSubida: (postulacionId: string, body: UploadUrlDto) =>
    api.post<UploadUrlRespuestaDto>(`/postulaciones/${postulacionId}/documentos/upload-url`, body),

  confirmar: (documentoId: string, body: { version: number; sha256?: string }) =>
    api.post<ConfirmarRespuestaDto>(`/documentos/${documentoId}/confirmar`, body),

  /** URL de lectura de 300 s (solo versiones disponibles). */
  urlLectura: (documentoId: string, version?: number) => api.get<UrlLecturaDto>(`/documentos/${documentoId}/url`, { query: { version } }),

  eliminar: (documentoId: string) => api.delete<void>(`/documentos/${documentoId}`),

  tipos: () => api.get<{ data: TipoDocumentoDto[] }>('/tipos-documento').then((r) => r.data),

  /** Con `tipo_tramite` devuelve exigibles calculados; sin el, la matriz de la convocatoria. */
  requisitos: (convocatoriaId: string, query: { beneficios?: string[]; tipo_tramite?: RequisitosQueryDto['tipo_tramite'] } = {}) =>
    api.get<{ convocatoria_id: string; beneficios: string[]; exigibles?: ExigibleDto[]; matriz?: unknown[] }>(
      `/convocatorias/${convocatoriaId}/requisitos-documentos`,
      { query: { beneficios: query.beneficios?.join(','), tipo_tramite: query.tipo_tramite } },
    ),

  /** Formatos oficiales de la postulacion (para vincular FORM_INS y PAG_CART). */
  formatos: (postulacionId: string) => api.get<ListadoFormatosDto>(`/postulaciones/${postulacionId}/formatos`),
};
