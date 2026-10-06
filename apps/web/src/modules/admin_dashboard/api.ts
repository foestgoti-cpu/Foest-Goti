import { api } from '../../lib/api';
import type { ComparativaPeriodos, ConvocatoriaConsolidada, RespuestaAlertas, RespuestaCarga, Resumen } from './types';

/** Cliente HTTP del modulo: panel gerencial. Configuracion y festivos viven en modules/catalogos_configuracion. */
export const adminDashboardApi = {
  resumen: () => api.get<Resumen>('/dashboard/admin/resumen'),
  alertas: () => api.get<RespuestaAlertas>('/dashboard/admin/alertas'),
  convocatorias: () => api.get<{ generado_en: string; convocatorias: ConvocatoriaConsolidada[] }>('/dashboard/admin/convocatorias'),
  metricasPeriodo: (a: string, b: string) => api.get<ComparativaPeriodos>('/dashboard/admin/metricas/periodo', { query: { a, b } }),
  cargaEvaluadores: (periodo?: string) => api.get<RespuestaCarga>('/dashboard/admin/carga-evaluadores', { query: { periodo } }),
};
