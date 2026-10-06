import { useQuery } from '@tanstack/react-query';
import { auditoriaApi } from '../api';
import type { FiltrosAuditoria } from '../types';

export function useCatalogoAuditoria() {
  return useQuery({ queryKey: ['auditoria', 'catalogo'], queryFn: auditoriaApi.catalogo, staleTime: Infinity });
}

export function useAuditoria(filtros: FiltrosAuditoria, page: number) {
  return useQuery({ queryKey: ['auditoria', 'lista', filtros, page], queryFn: () => auditoriaApi.listar(filtros, page), placeholderData: (prev) => prev });
}

export function useEventoAuditoria(id: string | null) {
  return useQuery({ queryKey: ['auditoria', 'evento', id], queryFn: () => auditoriaApi.detalle(id as string), enabled: Boolean(id) });
}
