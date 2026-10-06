import { useQuery } from '@tanstack/react-query';
import { beneficiarioDashboardApi } from '../api';

/** Claves de cache del modulo. */
export const CLAVES_DASHBOARD = {
  resumen: ['beneficiario_dashboard', 'resumen'] as const,
  lineaTiempo: (id: string) => ['beneficiario_dashboard', 'linea-tiempo', id] as const,
  documentos: (id: string) => ['beneficiario_dashboard', 'documentos', id] as const,
  descargas: ['beneficiario_dashboard', 'descargas'] as const,
  otorgamientos: ['beneficiario_dashboard', 'otorgamientos'] as const,
};

const REVALIDACION_MS = 60_000;

export function useResumenBeneficiario() {
  return useQuery({
    queryKey: CLAVES_DASHBOARD.resumen,
    queryFn: beneficiarioDashboardApi.resumen,
    refetchInterval: REVALIDACION_MS,
  });
}

export function useLineaTiempo(postulacionId: string | null | undefined) {
  return useQuery({
    queryKey: CLAVES_DASHBOARD.lineaTiempo(postulacionId ?? ''),
    queryFn: () => beneficiarioDashboardApi.lineaTiempo(postulacionId as string),
    enabled: Boolean(postulacionId),
  });
}

export function useDocumentosPostulacion(postulacionId: string | null | undefined) {
  return useQuery({
    queryKey: CLAVES_DASHBOARD.documentos(postulacionId ?? ''),
    queryFn: () => beneficiarioDashboardApi.documentos(postulacionId as string),
    enabled: Boolean(postulacionId),
  });
}

export function useDescargas() {
  return useQuery({ queryKey: CLAVES_DASHBOARD.descargas, queryFn: beneficiarioDashboardApi.descargas });
}

export function useOtorgamientos(habilitado = true) {
  return useQuery({ queryKey: CLAVES_DASHBOARD.otorgamientos, queryFn: beneficiarioDashboardApi.otorgamientos, enabled: habilitado });
}
