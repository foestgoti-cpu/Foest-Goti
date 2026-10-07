import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { evaluacionApi } from '../api';
import type { ChequeoInput, DictamenInput } from '../types';

export const clavesEvaluacion = {
  expediente: (id: string) => ['evaluacion', 'expediente', id] as const,
  historial: (id: string) => ['evaluacion', 'historial', id] as const,
};

export function useExpediente(id: string | undefined) {
  return useQuery({
    queryKey: clavesEvaluacion.expediente(id ?? ''),
    queryFn: () => evaluacionApi.expediente(id as string),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useHistorialRevisiones(id: string | undefined) {
  return useQuery({
    queryKey: clavesEvaluacion.historial(id ?? ''),
    queryFn: () => evaluacionApi.historialRevisiones(id as string),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useGuardarChequeo(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChequeoInput) => evaluacionApi.guardarChequeo(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesEvaluacion.expediente(id) }),
  });
}

export function useDictaminar(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DictamenInput) => evaluacionApi.dictaminar(id, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['evaluacion'] });
      await qc.invalidateQueries({ queryKey: ['asignaciones'] });
      await qc.invalidateQueries({ queryKey: ['postulaciones'] });
    },
  });
}
