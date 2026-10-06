import { api, type Paginado } from '../../lib/api';
import type {
  AuditoriaEvento,
  CatalogoAuditoria,
  ComparativaPeriodos,
  ConfiguracionItem,
  ConvocatoriaConsolidada,
  Festivo,
  FiltrosAuditoria,
  RespuestaAlertas,
  RespuestaCarga,
  Resumen,
} from './types';

/** Cliente HTTP del modulo: panel gerencial, auditoria, configuracion y festivos. */
export const adminDashboardApi = {
  resumen: () => api.get<Resumen>('/dashboard/admin/resumen'),
  alertas: () => api.get<RespuestaAlertas>('/dashboard/admin/alertas'),
  convocatorias: () => api.get<{ generado_en: string; convocatorias: ConvocatoriaConsolidada[] }>('/dashboard/admin/convocatorias'),
  metricasPeriodo: (a: string, b: string) => api.get<ComparativaPeriodos>('/dashboard/admin/metricas/periodo', { query: { a, b } }),
  cargaEvaluadores: (periodo?: string) => api.get<RespuestaCarga>('/dashboard/admin/carga-evaluadores', { query: { periodo } }),
};

export const auditoriaApi = {
  catalogo: () => api.get<CatalogoAuditoria>('/auditoria/catalogo'),
  listar: (filtros: FiltrosAuditoria, page: number, page_size = 20) =>
    api.get<Paginado<AuditoriaEvento>>('/auditoria', { query: { ...filtros, page, page_size } }),
  detalle: (id: string) => api.get<AuditoriaEvento>(`/auditoria/${id}`),
};

export const configuracionApi = {
  listar: (categoria?: string) => api.get<Paginado<ConfiguracionItem>>('/configuracion', { query: { categoria } }),
  actualizar: (clave: string, cuerpo: { valor: string | number | boolean | null; version: number; motivo?: string; confirmar: true }) =>
    api.put<ConfiguracionItem>(`/configuracion/${clave}`, cuerpo),
};

export const festivosApi = {
  listar: (anio: number) => api.get<{ anio: number; data: Festivo[] }>('/festivos', { query: { anio } }),
  crear: (cuerpo: { fecha: string; nombre: string }) => api.post<Festivo>('/festivos', cuerpo),
  eliminar: (id: string) => api.delete<void>(`/festivos/${id}`),
};
