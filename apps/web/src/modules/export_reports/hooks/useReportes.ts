import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ESTADOS_REPORTE_EN_CURSO, type FiltrosConsolidado, type FormatoConsolidado, type MisReportesQuery, type ReporteDto } from '@foest/shared';
import { reportesApi } from '../api';
import { INTERVALO_SONDEO_MS } from '../types';

const CLAVE = ['reportes'] as const;

const enCurso = (r: ReporteDto) => ESTADOS_REPORTE_EN_CURSO.includes(r.estado);

/** Mis reportes; sondea mientras haya alguno en COLA o PROCESANDO y cesa al terminar. */
export function useMisReportes(q: Partial<MisReportesQuery> = {}) {
  return useQuery({
    queryKey: [...CLAVE, 'me', q],
    queryFn: () => reportesApi.misReportes(q),
    refetchInterval: (query) => (query.state.data?.data.some(enCurso) ? INTERVALO_SONDEO_MS : false),
  });
}

/** Estado de un job concreto; sondea hasta que termine. */
export function useJobReporte(id: string | undefined) {
  return useQuery({
    queryKey: [...CLAVE, 'job', id],
    queryFn: () => reportesApi.obtenerJob(id as string),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data && enCurso(query.state.data) ? INTERVALO_SONDEO_MS : false),
  });
}

export function useSolicitarConsolidado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { convocatoriaId: string; formato: FormatoConsolidado; filtros?: FiltrosConsolidado }) =>
      reportesApi.solicitarConsolidado(d.convocatoriaId, d.formato, d.filtros),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
    // 409 REPORTE_EN_CURSO: refresca la lista para mostrar el que ya esta en marcha
    onError: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

/** Pide la URL firmada (120 s) en el momento del clic. */
export function useDescargarReporte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportesApi.urlDescarga(id),
    onError: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useDescargarResumen() {
  return useMutation({ mutationFn: (postulacionId: string) => reportesApi.descargarResumen(postulacionId) });
}
