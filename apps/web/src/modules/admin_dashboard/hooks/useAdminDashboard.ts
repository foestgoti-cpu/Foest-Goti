import { useQuery } from '@tanstack/react-query';
import { adminDashboardApi } from '../api';

/** Resumen y alertas con revalidacion periodica (la API cachea 60 s). */
const REVALIDACION_MS = 60_000;

export function useResumenAdmin() {
  return useQuery({ queryKey: ['admin', 'resumen'], queryFn: adminDashboardApi.resumen, refetchInterval: REVALIDACION_MS });
}

export function useAlertasAdmin() {
  return useQuery({ queryKey: ['admin', 'alertas'], queryFn: adminDashboardApi.alertas, refetchInterval: REVALIDACION_MS });
}

export function useConvocatoriasAdmin() {
  return useQuery({ queryKey: ['admin', 'convocatorias'], queryFn: adminDashboardApi.convocatorias });
}

export function useMetricasPeriodo(a: string | null, b: string | null) {
  return useQuery({
    queryKey: ['admin', 'metricas', a, b],
    queryFn: () => adminDashboardApi.metricasPeriodo(a as string, b as string),
    enabled: Boolean(a && b),
  });
}

export function useCargaEvaluadores(periodo?: string) {
  return useQuery({ queryKey: ['admin', 'carga', periodo ?? 'todos'], queryFn: () => adminDashboardApi.cargaEvaluadores(periodo) });
}
