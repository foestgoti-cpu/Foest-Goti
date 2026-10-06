import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { configuracionApi, festivosApi } from '../api';
import type { FestivoPropuesto } from '../types';

export function useConfiguracion(categoria?: string) {
  return useQuery({ queryKey: ['configuracion', categoria ?? 'todas'], queryFn: () => configuracionApi.listar(categoria) });
}

export function useConfiguracionPublica() {
  return useQuery({ queryKey: ['configuracion', 'publica'], queryFn: configuracionApi.publica, staleTime: 60_000 });
}

export function useActualizarConfiguracion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { clave: string; valor: string | number | boolean | null; version: number; motivo?: string }) =>
      configuracionApi.actualizar(p.clave, { valor: p.valor, version: p.version, motivo: p.motivo, confirmar: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['configuracion'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'alertas'] });
    },
  });
}

export function useFestivos(anio: number) {
  return useQuery({ queryKey: ['festivos', anio], queryFn: () => festivosApi.listar(anio) });
}

export function useFestivosPropuesta(anio: number, habilitado: boolean) {
  return useQuery({ queryKey: ['festivos', 'propuesta', anio], queryFn: () => festivosApi.propuesta(anio), enabled: habilitado });
}

export function useCrearFestivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: festivosApi.crear,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['festivos'] }),
  });
}

export function useEliminarFestivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: festivosApi.eliminar,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['festivos'] }),
  });
}

export function useCargaAnualFestivos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { anio: number; festivos: FestivoPropuesto[] }) => festivosApi.cargaAnual({ ...p, confirmar: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['festivos'] }),
  });
}

export function useDiasHabiles(desde: string, n: number, habilitado: boolean) {
  return useQuery({ queryKey: ['festivos', 'dias-habiles', desde, n], queryFn: () => festivosApi.diasHabiles(desde, n), enabled: habilitado, retry: false });
}
