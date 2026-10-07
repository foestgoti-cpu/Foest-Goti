import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatosApi } from '../services/formatosApi';
import type { TipoFormato } from '../types';

export const clavesFormatos = {
  lista: (postulacionId: string) => ['formatos', 'lista', postulacionId] as const,
  verificacion: (codigo: string) => ['formatos', 'verificacion', codigo] as const,
};

/** Formatos de la postulacion; sondea cada 3 s mientras alguno siga en GENERANDO. */
export function useFormatos(postulacionId: string | undefined) {
  return useQuery({
    queryKey: clavesFormatos.lista(postulacionId ?? ''),
    queryFn: () => formatosApi.getFormatos(postulacionId as string),
    enabled: Boolean(postulacionId),
    refetchInterval: (query) => (query.state.data?.formatos.some((f) => f.formato?.estado === 'GENERANDO') ? 3000 : false),
  });
}

export function useGenerarFormato(postulacionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tipo: TipoFormato) => formatosApi.generarFormato(postulacionId, tipo),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: clavesFormatos.lista(postulacionId) });
      // La validacion previa de la postulacion depende vigencia de los formatos.
      void qc.invalidateQueries({ queryKey: ['postulaciones', 'validacion', postulacionId] });
    },
  });
}

/** Solicita la URL firmada (300 s) y abre la descarga. */
export function useDescargarFormato() {
  return useMutation({
    mutationFn: async (formatoId: string) => {
      const { url } = await formatosApi.getUrlDescarga(formatoId);
      window.open(url, '_blank', 'noopener');
    },
  });
}

export function useVerificarFormato(codigo: string | undefined) {
  return useQuery({
    queryKey: clavesFormatos.verificacion(codigo ?? ''),
    queryFn: () => formatosApi.verificarPublico(codigo as string),
    enabled: Boolean(codigo),
    retry: false,
  });
}
