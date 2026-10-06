import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { dashboardFuncionarioApi } from '../api';
import type { FiltrosDashboard } from '../types';

/** Revalidacion en segundo plano alineada con la cache de la API (60 s). */
const REVALIDACION_MS = 60_000;

function claveFiltros(f: FiltrosDashboard) {
  return { convocatoria_id: f.convocatoria_id ?? null, desde: f.desde ?? null, hasta: f.hasta ?? null };
}

/**
 * Hooks de datos del panel. `placeholderData: keepPreviousData` mantiene el ultimo
 * render mientras se recargan los filtros (sin saltos de layout).
 */
export function useResumenFuncionario(f: FiltrosDashboard) {
  return useQuery({
    queryKey: ['dashboard_funcionario', 'resumen', claveFiltros(f)],
    queryFn: () => dashboardFuncionarioApi.resumen(f),
    placeholderData: keepPreviousData,
    refetchInterval: REVALIDACION_MS,
  });
}

export function usePorBeneficio(f: FiltrosDashboard) {
  return useQuery({
    queryKey: ['dashboard_funcionario', 'por-beneficio', claveFiltros(f)],
    queryFn: () => dashboardFuncionarioApi.porBeneficio(f),
    placeholderData: keepPreviousData,
    refetchInterval: REVALIDACION_MS,
  });
}

export function usePorTipoSolicitud(f: FiltrosDashboard) {
  return useQuery({
    queryKey: ['dashboard_funcionario', 'por-tipo-solicitud', claveFiltros(f)],
    queryFn: () => dashboardFuncionarioApi.porTipoSolicitud(f),
    placeholderData: keepPreviousData,
    refetchInterval: REVALIDACION_MS,
  });
}

export function useSerieTemporal(f: FiltrosDashboard) {
  return useQuery({
    queryKey: ['dashboard_funcionario', 'serie-temporal', claveFiltros(f)],
    queryFn: () => dashboardFuncionarioApi.serieTemporal(f),
    placeholderData: keepPreviousData,
    refetchInterval: REVALIDACION_MS,
  });
}

export function useTiemposRevision(f: FiltrosDashboard) {
  return useQuery({
    queryKey: ['dashboard_funcionario', 'tiempos-revision', claveFiltros(f)],
    queryFn: () => dashboardFuncionarioApi.tiemposRevision(f),
    placeholderData: keepPreviousData,
    refetchInterval: REVALIDACION_MS,
  });
}

export function useCargaComite(f: FiltrosDashboard) {
  return useQuery({
    queryKey: ['dashboard_funcionario', 'carga', claveFiltros(f)],
    queryFn: () => dashboardFuncionarioApi.carga(f),
    placeholderData: keepPreviousData,
    refetchInterval: REVALIDACION_MS,
  });
}

export function useConvocatoriasComite() {
  return useQuery({
    queryKey: ['dashboard_funcionario', 'convocatorias'],
    queryFn: () => dashboardFuncionarioApi.convocatorias(),
    staleTime: 5 * 60_000,
  });
}
