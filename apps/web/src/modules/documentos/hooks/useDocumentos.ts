import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentosApi } from '../services/documentosApi';
import type { DocumentosPostulacionDto } from '../types';

export const clavesDocumentos = {
  postulacion: (id: string) => ['documentos', 'postulacion', id] as const,
  formatos: (id: string) => ['documentos', 'formatos', id] as const,
};

function hayEscaneoEnCurso(d: DocumentosPostulacionDto | undefined): boolean {
  if (!d) return false;
  return d.documentos.some((x) => x.estado_carga === 'ESCANEANDO' || x.version_en_curso?.estado_carga === 'ESCANEANDO');
}

/** Documentos y exigibles de una postulacion; se refresca solo mientras haya un escaneo en curso. */
export function useDocumentosPostulacion(postulacionId: string | undefined) {
  return useQuery({
    queryKey: clavesDocumentos.postulacion(postulacionId ?? ''),
    queryFn: () => documentosApi.listar(postulacionId as string),
    enabled: Boolean(postulacionId),
    refetchInterval: (q) => (hayEscaneoEnCurso(q.state.data) ? 2500 : false),
  });
}

/** Formatos oficiales de la postulacion; falla en silencio si el modulo no esta disponible. */
export function useFormatosParaDocumentos(postulacionId: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: clavesDocumentos.formatos(postulacionId ?? ''),
    queryFn: () => documentosApi.formatos(postulacionId as string),
    enabled: Boolean(postulacionId) && habilitado,
    retry: false,
  });
}

export function useEliminarDocumento(postulacionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentoId: string) => documentosApi.eliminar(documentoId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: clavesDocumentos.postulacion(postulacionId) });
      await qc.invalidateQueries({ queryKey: ['postulaciones', 'validacion', postulacionId] });
    },
  });
}

/** Invalida documentos y la validacion de la postulacion (el checklist del asistente depende de ambos). */
export function useInvalidarDocumentos(postulacionId: string) {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: clavesDocumentos.postulacion(postulacionId) });
    await qc.invalidateQueries({ queryKey: ['postulaciones', 'validacion', postulacionId] });
  };
}
