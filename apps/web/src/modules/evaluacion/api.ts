import { api } from '../../lib/api';
import type {
  ChequeoGuardadoDto,
  ChequeoInput,
  DictamenInput,
  DictamenRespuestaDto,
  ExpedienteEvaluacionDto,
  HistorialRevisionesDto,
  UrlDocumento,
} from './types';

/** Cliente HTTP del modulo evaluacion (prefijo /evaluacion). */
export const evaluacionApi = {
  expediente: (id: string) => api.get<ExpedienteEvaluacionDto>(`/evaluacion/postulaciones/${id}`),

  guardarChequeo: (id: string, body: ChequeoInput) => api.put<ChequeoGuardadoDto>(`/evaluacion/postulaciones/${id}/chequeo`, body),

  dictaminar: (id: string, body: DictamenInput) => api.post<DictamenRespuestaDto>(`/evaluacion/postulaciones/${id}/dictamen`, body),

  historialRevisiones: (id: string) =>
    api.get<HistorialRevisionesDto>(`/evaluacion/postulaciones/${id}/historial-revisiones`).then((r) => r.data),

  /** URL firmada de lectura (300 s) del modulo documentos. */
  urlDocumento: (documentoId: string) => api.get<UrlDocumento>(`/documentos/${documentoId}/url`),
};
