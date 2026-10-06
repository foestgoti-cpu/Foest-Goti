import { api, type Paginado } from '../../lib/api';
import type { ContadorNotificaciones, Descargas, Documentos, LineaTiempo, Notificacion, Otorgamientos, Resumen } from './types';

const BASE = '/dashboard/beneficiario';

/** Cliente HTTP del portal del beneficiario. */
export const beneficiarioDashboardApi = {
  resumen: () => api.get<Resumen>(`${BASE}/resumen`),
  lineaTiempo: (postulacionId: string) => api.get<LineaTiempo>(`${BASE}/postulaciones/${postulacionId}/linea-tiempo`),
  documentos: (postulacionId: string) => api.get<Documentos>(`${BASE}/postulaciones/${postulacionId}/documentos`),
  descargas: () => api.get<Descargas>(`${BASE}/descargas`),
  otorgamientos: () => api.get<Otorgamientos>(`${BASE}/otorgamientos`),
  /** Resuelve la URL prefirmada de un formato (endpoint de formatos_oficiales). */
  urlDescarga: (rutaApi: string) => api.get<{ url: string; expira_en?: string }>(rutaApi),
};

/** Buzon in-app (cualquier rol). */
export const notificacionesApi = {
  listar: (params: { page?: number; page_size?: number; leida?: boolean; severidad?: string } = {}) =>
    api.get<Paginado<Notificacion>>('/notificaciones/me', { query: { page: params.page, page_size: params.page_size, leida: params.leida, severidad: params.severidad } }),
  contador: () => api.get<ContadorNotificaciones>('/notificaciones/me/no-leidas/contador'),
  marcarLeida: (id: string) => api.patch<Notificacion>(`/notificaciones/${id}/leida`),
  leerTodas: () => api.patch<{ afectadas: number }>('/notificaciones/leer-todas'),
};
