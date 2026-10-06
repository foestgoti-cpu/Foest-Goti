import type { EstadoConvocatoria } from '@foest/shared';
import { api, type Paginado } from '../../lib/api';
import type {
  ActualizarConvocatoriaInput,
  Beneficio,
  ConvocatoriaDetalle,
  ConvocatoriaPublica,
  ConvocatoriaResumen,
  CrearConvocatoriaInput,
  FuncionarioCuenta,
  ListadoPublico,
  MiembroComite,
  RespuestaComite,
  RespuestaDeshabilitar,
} from './types';

export interface FiltrosConvocatorias {
  page?: number;
  page_size?: number;
  estado?: EstadoConvocatoria | '';
  anio?: number | '';
  semestre?: number | '';
  abiertas?: boolean;
}

export type ListadoConvocatorias = Paginado<ConvocatoriaResumen> & { proxima_apertura_estimada: string | null };

/** Cliente HTTP del modulo: funciones puras que envuelven `api`. */
export const convocatoriasApi = {
  // Publico (sin sesion)
  listarPublicas: () => api.get<ListadoPublico>('/publico/convocatorias', { auth: false }),
  obtenerPublica: (id: string) => api.get<ConvocatoriaPublica>(`/publico/convocatorias/${id}`, { auth: false }),

  // Autenticado
  listar: (f: FiltrosConvocatorias = {}) =>
    api.get<ListadoConvocatorias>('/convocatorias', {
      query: { page: f.page, page_size: f.page_size, estado: f.estado || undefined, anio: f.anio || undefined, semestre: f.semestre || undefined, abiertas: f.abiertas },
    }),
  obtener: (id: string) => api.get<ConvocatoriaDetalle>(`/convocatorias/${id}`),
  crear: (datos: CrearConvocatoriaInput) => api.post<ConvocatoriaDetalle>('/convocatorias', datos),
  actualizar: (id: string, datos: ActualizarConvocatoriaInput) => api.put<ConvocatoriaDetalle>(`/convocatorias/${id}`, datos),
  habilitar: (id: string, version: number) => api.patch<ConvocatoriaDetalle>(`/convocatorias/${id}/habilitar`, { version }),
  deshabilitar: (id: string, datos: { motivo: string; version: number }) =>
    api.patch<RespuestaDeshabilitar>(`/convocatorias/${id}/deshabilitar`, { ...datos, confirmar: true }),
  rehabilitar: (id: string, version: number) => api.patch<ConvocatoriaDetalle>(`/convocatorias/${id}/rehabilitar`, { version }),
  ampliar: (id: string, datos: { fecha_cierre_nueva: string; motivo: string; version: number }) =>
    api.patch<ConvocatoriaDetalle>(`/convocatorias/${id}/ampliar`, { ...datos, confirmar: true }),
  archivar: (id: string, version: number) => api.patch<ConvocatoriaDetalle>(`/convocatorias/${id}/archivar`, { confirmar: true, version }),
  listarComite: (id: string) => api.get<{ data: MiembroComite[] }>(`/convocatorias/${id}/funcionarios`),
  definirComite: (id: string, datos: { funcionario_ids: string[]; asignaciones?: 'LIBERAR' | 'MANTENER' }) =>
    api.put<RespuestaComite>(`/convocatorias/${id}/funcionarios`, datos),

  // Catalogos de otros modulos
  listarBeneficios: () => api.get<{ data: Beneficio[] }>('/beneficios'),
  listarFuncionarios: () => api.get<Paginado<FuncionarioCuenta>>('/funcionarios', { query: { page: 1, page_size: 100 } }),
};
