import type {
  AlertaAsignacionDto,
  AsignacionDto,
  ConflictoInteresDto,
  EvaluadorCargaDto,
  HistorialAsignacionDto,
  ReasignarInput,
  ReasignarMasivoInput,
  ResultadoReasignacionMasivoDto,
  ResumenBandejaDto,
} from '@foest/shared';
import { api, type Paginado } from '../../lib/api';
import type { FiltrosBandeja } from './types';

function lista<T>(r: T[] | { data: T[] }): T[] {
  return Array.isArray(r) ? r : r.data;
}

/** Cliente HTTP del modulo asignaciones (prefijo /asignaciones). */
export const asignacionesApi = {
  bandeja: (f: FiltrosBandeja, page_size = 20) =>
    api.get<Paginado<ResumenBandejaDto>>('/asignaciones/bandeja', {
      query: { page: f.page, page_size, vista: f.vista, tipo_solicitud: f.tipo_solicitud, beneficio: f.beneficio },
    }),

  tomar: (id: string, version?: number) => api.post<AsignacionDto>(`/asignaciones/postulaciones/${id}/tomar`, { version }),
  liberar: (id: string, version?: number) => api.post<AsignacionDto>(`/asignaciones/postulaciones/${id}/liberar`, { version }),
  conflicto: (id: string, motivo: string, version?: number) =>
    api.post<ConflictoInteresDto>(`/asignaciones/postulaciones/${id}/conflicto-interes`, { motivo, version }),

  reasignar: (id: string, body: ReasignarInput) => api.post<AsignacionDto>(`/asignaciones/postulaciones/${id}/reasignar`, body),
  reasignarMasivo: (body: ReasignarMasivoInput) => api.post<ResultadoReasignacionMasivoDto>('/asignaciones/reasignar-masivo', body),

  historial: (id: string) =>
    api.get<HistorialAsignacionDto[] | { data: HistorialAsignacionDto[] }>(`/asignaciones/postulaciones/${id}/historial`).then(lista),

  alertas: (page = 1, page_size = 20) => api.get<Paginado<AlertaAsignacionDto>>('/asignaciones/alertas', { query: { page, page_size } }),

  evaluadores: (postulacionId?: string) =>
    api
      .get<EvaluadorCargaDto[] | { data: EvaluadorCargaDto[] }>('/asignaciones/evaluadores', { query: { postulacion_id: postulacionId } })
      .then(lista),
};
