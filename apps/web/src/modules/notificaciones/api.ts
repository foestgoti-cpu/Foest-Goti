import { api, type Paginado } from '../../lib/api';
import type {
  ContadorNotificaciones,
  DestinatarioSuprimido,
  EntregaCorreo,
  EventoOutbox,
  FiltrosBuzon,
  FiltrosEntregas,
  FiltrosOutbox,
  Notificacion,
  OutboxListado,
  PreferenciasNotificacion,
  PreferenciasNotificacionInput,
  ResumenEntregabilidad,
} from './types';

/** Buzon in-app y preferencias (cualquier rol). Mismos contratos que consume la campana del AppShell. */
export const notificacionesApi = {
  listar: (params: FiltrosBuzon = {}) =>
    api.get<Paginado<Notificacion>>('/notificaciones/me', {
      query: { page: params.page, page_size: params.page_size, leida: params.leida, severidad: params.severidad, tipo: params.tipo },
    }),
  contador: () => api.get<ContadorNotificaciones>('/notificaciones/me/no-leidas/contador'),
  marcarLeida: (id: string) => api.patch<Notificacion>(`/notificaciones/${id}/leida`),
  leerTodas: () => api.patch<{ afectadas: number }>('/notificaciones/leer-todas'),
  preferencias: () => api.get<PreferenciasNotificacion>('/notificaciones/me/preferencias'),
  actualizarPreferencias: (cuerpo: PreferenciasNotificacionInput) => api.put<PreferenciasNotificacion>('/notificaciones/me/preferencias', cuerpo),
};

/** Administracion: outbox, entregas, entregabilidad y supresiones (permiso notificacion:administrar). */
export const notificacionesAdminApi = {
  outbox: (params: FiltrosOutbox = {}) =>
    api.get<OutboxListado>('/notificaciones/admin/outbox', { query: { page: params.page, page_size: params.page_size, estado: params.estado, tipo: params.tipo } }),
  outboxDetalle: (id: string) => api.get<EventoOutbox>(`/notificaciones/admin/outbox/${id}`),
  reintentar: (id: string) => api.post<EventoOutbox>(`/notificaciones/admin/outbox/${id}/reintentar`),
  entregas: (params: FiltrosEntregas = {}) =>
    api.get<Paginado<EntregaCorreo>>('/notificaciones/admin/entregas', { query: { page: params.page, page_size: params.page_size, estado: params.estado, email: params.email } }),
  entregabilidad: () => api.get<ResumenEntregabilidad>('/notificaciones/admin/entregabilidad'),
  levantarSupresion: (cuerpo: { email: string; motivo: string }) => api.post<DestinatarioSuprimido>('/notificaciones/admin/suprimidos/levantar', cuerpo),
};
