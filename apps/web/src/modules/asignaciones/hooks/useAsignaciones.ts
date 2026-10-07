import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReasignarInput, ReasignarMasivoInput } from '@foest/shared';
import { asignacionesApi } from '../api';
import type { FiltrosBandeja } from '../types';

export const clavesAsignaciones = {
  todo: ['asignaciones'] as const,
  bandeja: (f: FiltrosBandeja) => ['asignaciones', 'bandeja', f] as const,
  historial: (id: string) => ['asignaciones', 'historial', id] as const,
  alertas: (page: number) => ['asignaciones', 'alertas', page] as const,
  evaluadores: (postulacionId?: string) => ['asignaciones', 'evaluadores', postulacionId ?? 'todos'] as const,
};

export function useBandeja(f: FiltrosBandeja) {
  return useQuery({ queryKey: clavesAsignaciones.bandeja(f), queryFn: () => asignacionesApi.bandeja(f) });
}

export function useHistorialAsignacion(id: string | undefined) {
  return useQuery({
    queryKey: clavesAsignaciones.historial(id ?? ''),
    queryFn: () => asignacionesApi.historial(id as string),
    enabled: Boolean(id),
  });
}

export function useAlertas(page: number) {
  return useQuery({ queryKey: clavesAsignaciones.alertas(page), queryFn: () => asignacionesApi.alertas(page) });
}

/** Con `postulacionId` el API marca los funcionarios excluidos o fuera del comite de ese expediente. */
export function useEvaluadores(postulacionId?: string, habilitado = true) {
  return useQuery({
    queryKey: clavesAsignaciones.evaluadores(postulacionId),
    queryFn: () => asignacionesApi.evaluadores(postulacionId),
    enabled: habilitado,
  });
}

/** Toda mutacion invalida el modulo completo (bandeja, alertas, evaluadores, historial) y las postulaciones. */
function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: clavesAsignaciones.todo });
    void qc.invalidateQueries({ queryKey: ['postulaciones'] });
  };
}

export function useTomar() {
  const invalidar = useInvalidar();
  return useMutation({ mutationFn: (v: { id: string; version?: number }) => asignacionesApi.tomar(v.id, v.version), onSettled: invalidar });
}

export function useLiberar() {
  const invalidar = useInvalidar();
  return useMutation({ mutationFn: (v: { id: string; version?: number }) => asignacionesApi.liberar(v.id, v.version), onSettled: invalidar });
}

export function useConflicto() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { id: string; motivo: string; version?: number }) => asignacionesApi.conflicto(v.id, v.motivo, v.version),
    onSettled: invalidar,
  });
}

export function useReasignar() {
  const invalidar = useInvalidar();
  return useMutation({ mutationFn: (v: { id: string; body: ReasignarInput }) => asignacionesApi.reasignar(v.id, v.body), onSettled: invalidar });
}

export function useReasignarMasivo() {
  const invalidar = useInvalidar();
  return useMutation({ mutationFn: (body: ReasignarMasivoInput) => asignacionesApi.reasignarMasivo(body), onSettled: invalidar });
}
