import { useMutation, useQuery } from '@tanstack/react-query';
import { auditoriaApi } from '../api';
import type { AuditoriaFiltros } from '../types';

export function useCatalogoAuditoria() {
  return useQuery({ queryKey: ['auditoria', 'catalogo'], queryFn: auditoriaApi.catalogo, staleTime: Infinity });
}

export function useAuditoria(filtros: AuditoriaFiltros, page: number) {
  return useQuery({
    queryKey: ['auditoria', 'lista', filtros, page],
    queryFn: () => auditoriaApi.listar(filtros, page),
    placeholderData: (prev) => prev,
  });
}

export function useEventoAuditoria(id: string | null) {
  return useQuery({ queryKey: ['auditoria', 'evento', id], queryFn: () => auditoriaApi.detalle(id as string), enabled: Boolean(id) });
}

export function useLineaTiempoAuditoria(entidad: string | null, entidadId: string | null) {
  return useQuery({
    queryKey: ['auditoria', 'linea', entidad, entidadId],
    queryFn: () => auditoriaApi.porEntidad(entidad as string, entidadId as string),
    enabled: Boolean(entidad && entidadId),
  });
}

export function useIntegridadAuditoria() {
  return useQuery({ queryKey: ['auditoria', 'integridad'], queryFn: auditoriaApi.integridad, staleTime: 60_000 });
}

/** Descarga el CSV en el navegador. */
export function useExportarAuditoria() {
  return useMutation({
    mutationFn: async ({ filtros, motivo }: { filtros: AuditoriaFiltros; motivo: string }) => {
      const { blob, nombre } = await auditoriaApi.exportar(filtros, motivo);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return nombre;
    },
  });
}
