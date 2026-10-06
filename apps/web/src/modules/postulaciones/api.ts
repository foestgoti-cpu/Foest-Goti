import type { TipoSolicitud, CodigoBeneficio } from '@foest/shared';
import { api, type Paginado } from '../../lib/api';
import type {
  ConvocatoriaResumen,
  FiltrosAdmin,
  GuardarPayload,
  HistorialAdminItem,
  HistorialItem,
  Postulacion,
  PostulacionAdmin,
  ResultadoEnvio,
  Validacion,
} from './types';

/** Cliente HTTP del modulo (envuelve `api` de lib/api.ts, que adjunta el Bearer). */
export const postulacionesApi = {
  convocatoriasAbiertas: () => api.get<{ data: ConvocatoriaResumen[] }>('/postulaciones/convocatorias-abiertas').then((r) => r.data),

  listarPropias: (page = 1, page_size = 20) => api.get<Paginado<Postulacion>>('/postulaciones/me', { query: { page, page_size } }),

  crear: (body: { convocatoria_id: string; tipo_solicitud: TipoSolicitud; beneficios?: CodigoBeneficio[] }) =>
    api.post<Postulacion>('/postulaciones', body),

  obtener: (id: string) => api.get<Postulacion>(`/postulaciones/${id}`),

  guardar: (id: string, body: GuardarPayload) => api.put<Postulacion>(`/postulaciones/${id}`, body),

  eliminar: (id: string) => api.delete<void>(`/postulaciones/${id}`),

  validacion: (id: string) => api.get<Validacion>(`/postulaciones/${id}/validacion`),

  enviar: (id: string, body: { confirmar: true; version: number; declaraciones_aceptadas: string[] }, idempotencyKey: string) =>
    api.post<ResultadoEnvio>(`/postulaciones/${id}/enviar`, body, { headers: { 'Idempotency-Key': idempotencyKey } }),

  subsanar: (id: string, body: { confirmar: true; version: number; declaraciones_aceptadas: string[] }, idempotencyKey: string) =>
    api.post<ResultadoEnvio>(`/postulaciones/${id}/subsanar`, body, { headers: { 'Idempotency-Key': idempotencyKey } }),

  desistir: (id: string, body: { version: number; motivo?: string }) => api.post<Postulacion>(`/postulaciones/${id}/desistir`, body),

  historial: (id: string) => api.get<{ data: HistorialItem[] }>(`/postulaciones/${id}/historial`).then((r) => r.data),

  // Administrador (solo lectura)
  listarAdmin: (f: FiltrosAdmin, page_size = 20) =>
    api.get<Paginado<PostulacionAdmin>>('/postulaciones', {
      query: { page: f.page, page_size, convocatoria_id: f.convocatoria_id, estado: f.estado, tipo_solicitud: f.tipo_solicitud, q: f.q },
    }),
  obtenerAdmin: (id: string) => api.get<PostulacionAdmin>(`/postulaciones/${id}`),
  historialAdmin: (id: string) => api.get<{ data: HistorialAdminItem[] }>(`/postulaciones/${id}/historial`).then((r) => r.data),
};
