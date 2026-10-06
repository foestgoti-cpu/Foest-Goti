import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sniesApi } from '../api';

export function useBuscarIes(q: string, habilitado = true) {
  return useQuery({ queryKey: ['snies', 'ies', q], queryFn: () => sniesApi.buscarIes(q, 1, 20), enabled: habilitado && q.trim().length >= 2, staleTime: 60_000 });
}

export function useProgramasDeIes(codigoIes: string | null, q: string) {
  return useQuery({
    queryKey: ['snies', 'programas', codigoIes, q],
    queryFn: () => sniesApi.programasDeIes(codigoIes as string, q, 1, 20),
    enabled: codigoIes !== null,
    staleTime: 60_000,
  });
}

export function useProgramaSnies(codigo: string | null) {
  return useQuery({ queryKey: ['snies', 'programa', codigo], queryFn: () => sniesApi.detallePrograma(codigo as string), enabled: codigo !== null, retry: false });
}

export function useImportacionesSnies(page: number) {
  return useQuery({ queryKey: ['snies', 'importaciones', page], queryFn: () => sniesApi.importaciones(page, 20) });
}

export function useImportarSnies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { archivo: File; modo: 'real' | 'simulacion' }) => sniesApi.importar(p.archivo, p.modo),
    onSuccess: (_r, v) => {
      if (v.modo === 'real') void qc.invalidateQueries({ queryKey: ['snies'] });
    },
  });
}
