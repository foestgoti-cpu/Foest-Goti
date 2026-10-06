import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { convocatoriasApi, type FiltrosConvocatorias } from '../api';
import type { ActualizarConvocatoriaInput, CrearConvocatoriaInput } from '../types';

const CLAVE = ['convocatorias'] as const;

export function usePublicas() {
  return useQuery({ queryKey: [...CLAVE, 'publicas'], queryFn: convocatoriasApi.listarPublicas, staleTime: 60_000 });
}

export function usePublica(id: string | undefined) {
  return useQuery({ queryKey: [...CLAVE, 'publicas', id], queryFn: () => convocatoriasApi.obtenerPublica(id as string), enabled: Boolean(id), retry: false });
}

export function useConvocatorias(filtros: FiltrosConvocatorias) {
  return useQuery({ queryKey: [...CLAVE, 'lista', filtros], queryFn: () => convocatoriasApi.listar(filtros) });
}

export function useConvocatoria(id: string | undefined) {
  return useQuery({ queryKey: [...CLAVE, 'detalle', id], queryFn: () => convocatoriasApi.obtener(id as string), enabled: Boolean(id), retry: false });
}

export function useBeneficios() {
  return useQuery({ queryKey: ['beneficios'], queryFn: convocatoriasApi.listarBeneficios, staleTime: 5 * 60_000 });
}

export function useFuncionarios(habilitado = true) {
  return useQuery({ queryKey: ['funcionarios', 'para-comite'], queryFn: convocatoriasApi.listarFuncionarios, enabled: habilitado, retry: false });
}

/** Mutaciones de una convocatoria; todas invalidan lista y detalle. */
export function useMutacionesConvocatoria(id?: string) {
  const qc = useQueryClient();
  const invalidar = async () => {
    await qc.invalidateQueries({ queryKey: CLAVE });
  };
  return {
    crear: useMutation({ mutationFn: (d: CrearConvocatoriaInput) => convocatoriasApi.crear(d), onSuccess: invalidar }),
    actualizar: useMutation({ mutationFn: (d: ActualizarConvocatoriaInput) => convocatoriasApi.actualizar(id as string, d), onSuccess: invalidar }),
    habilitar: useMutation({ mutationFn: (version: number) => convocatoriasApi.habilitar(id as string, version), onSuccess: invalidar }),
    deshabilitar: useMutation({ mutationFn: (d: { motivo: string; version: number }) => convocatoriasApi.deshabilitar(id as string, d), onSuccess: invalidar }),
    rehabilitar: useMutation({ mutationFn: (version: number) => convocatoriasApi.rehabilitar(id as string, version), onSuccess: invalidar }),
    ampliar: useMutation({
      mutationFn: (d: { fecha_cierre_nueva: string; motivo: string; version: number }) => convocatoriasApi.ampliar(id as string, d),
      onSuccess: invalidar,
    }),
    archivar: useMutation({ mutationFn: (version: number) => convocatoriasApi.archivar(id as string, version), onSuccess: invalidar }),
    definirComite: useMutation({
      mutationFn: (d: { funcionario_ids: string[]; asignaciones?: 'LIBERAR' | 'MANTENER' }) => convocatoriasApi.definirComite(id as string, d),
      onSuccess: invalidar,
    }),
  };
}
