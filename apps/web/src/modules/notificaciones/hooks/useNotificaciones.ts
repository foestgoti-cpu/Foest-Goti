import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificacionesApi } from '../api';
import type { FiltrosBuzon, PreferenciasNotificacionInput } from '../types';

/**
 * Hooks del buzon para funcionario y administrador. Comparten el prefijo de clave
 * `['notificaciones']` con la campana del AppShell (beneficiario_dashboard) para que
 * marcar como leida aqui actualice el contador del encabezado.
 */
export const CLAVES = {
  todas: ['notificaciones'] as const,
  contador: ['notificaciones', 'contador'] as const,
  lista: (f: FiltrosBuzon) => ['notificaciones', 'lista', f.page ?? 1, f.leida ?? null, f.severidad ?? null, f.tipo ?? null, f.page_size ?? 20] as const,
  preferencias: ['notificaciones', 'preferencias'] as const,
};

export function useContadorNotificaciones() {
  return useQuery({ queryKey: CLAVES.contador, queryFn: notificacionesApi.contador, refetchInterval: 60_000 });
}

export function useBuzon(filtros: FiltrosBuzon) {
  return useQuery({ queryKey: CLAVES.lista(filtros), queryFn: () => notificacionesApi.listar(filtros) });
}

function usarInvalidacion() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CLAVES.todas });
    void qc.invalidateQueries({ queryKey: ['beneficiario_dashboard', 'resumen'] });
  };
}

export function useMarcarLeida() {
  const invalidar = usarInvalidacion();
  return useMutation({ mutationFn: (id: string) => notificacionesApi.marcarLeida(id), onSuccess: invalidar });
}

export function useLeerTodas() {
  const invalidar = usarInvalidacion();
  return useMutation({ mutationFn: () => notificacionesApi.leerTodas(), onSuccess: invalidar });
}

export function usePreferencias() {
  return useQuery({ queryKey: CLAVES.preferencias, queryFn: notificacionesApi.preferencias });
}

export function useActualizarPreferencias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cuerpo: PreferenciasNotificacionInput) => notificacionesApi.actualizarPreferencias(cuerpo),
    onSuccess: (data) => qc.setQueryData(CLAVES.preferencias, data),
  });
}
