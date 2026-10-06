import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { configuracionApi, festivosApi } from '../api';

export function useConfiguracion(categoria?: string) {
  return useQuery({ queryKey: ['configuracion', categoria ?? 'todas'], queryFn: () => configuracionApi.listar(categoria) });
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
