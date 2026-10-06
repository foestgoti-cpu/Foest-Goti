import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificacionesApi } from '../api';

export const CLAVES_NOTIFICACIONES = {
  todas: ['notificaciones'] as const,
  contador: ['notificaciones', 'contador'] as const,
  lista: (page: number, soloNoLeidas: boolean) => ['notificaciones', 'lista', page, soloNoLeidas] as const,
};

const CONTADOR_MS = 60_000;

export function useContadorNotificaciones(habilitado = true) {
  return useQuery({
    queryKey: CLAVES_NOTIFICACIONES.contador,
    queryFn: notificacionesApi.contador,
    refetchInterval: CONTADOR_MS,
    enabled: habilitado,
  });
}

export function useNotificaciones(page: number, soloNoLeidas: boolean, pageSize = 20) {
  return useQuery({
    queryKey: CLAVES_NOTIFICACIONES.lista(page, soloNoLeidas),
    queryFn: () => notificacionesApi.listar({ page, page_size: pageSize, leida: soloNoLeidas ? false : undefined }),
  });
}

/** Invalida contador, listas y el resumen del dashboard (que incluye el conteo de criticas). */
function usarInvalidacion() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CLAVES_NOTIFICACIONES.todas });
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
