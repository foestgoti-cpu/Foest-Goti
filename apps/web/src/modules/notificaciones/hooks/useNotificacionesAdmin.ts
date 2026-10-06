import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificacionesAdminApi } from '../api';
import type { FiltrosEntregas, FiltrosOutbox } from '../types';

export const CLAVES_ADMIN = {
  todas: ['notificaciones_admin'] as const,
  outbox: (f: FiltrosOutbox) => ['notificaciones_admin', 'outbox', f.page ?? 1, f.estado ?? null, f.tipo ?? null] as const,
  entregas: (f: FiltrosEntregas) => ['notificaciones_admin', 'entregas', f.page ?? 1, f.estado ?? null, f.email ?? null] as const,
  entregabilidad: ['notificaciones_admin', 'entregabilidad'] as const,
};

export function useOutbox(filtros: FiltrosOutbox) {
  return useQuery({ queryKey: CLAVES_ADMIN.outbox(filtros), queryFn: () => notificacionesAdminApi.outbox(filtros), refetchInterval: 30_000 });
}

export function useEntregas(filtros: FiltrosEntregas) {
  return useQuery({ queryKey: CLAVES_ADMIN.entregas(filtros), queryFn: () => notificacionesAdminApi.entregas(filtros) });
}

export function useEntregabilidad() {
  return useQuery({ queryKey: CLAVES_ADMIN.entregabilidad, queryFn: notificacionesAdminApi.entregabilidad, refetchInterval: 60_000 });
}

function usarInvalidacionAdmin() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: CLAVES_ADMIN.todas });
}

export function useReintentarOutbox() {
  const invalidar = usarInvalidacionAdmin();
  return useMutation({ mutationFn: (id: string) => notificacionesAdminApi.reintentar(id), onSuccess: invalidar });
}

export function useLevantarSupresion() {
  const invalidar = usarInvalidacionAdmin();
  return useMutation({ mutationFn: (cuerpo: { email: string; motivo: string }) => notificacionesAdminApi.levantarSupresion(cuerpo), onSuccess: invalidar });
}
