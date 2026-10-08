import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActualizarFuncionarioDto, CambiarEstadoCuentaDto, CrearFuncionarioDto, RestablecerClaveDto } from '@foest/shared';
import { accountsApi, type FiltrosFuncionarios } from '../api';

const CLAVE = ['accounts', 'funcionarios'] as const;

export function useFuncionarios(filtros: FiltrosFuncionarios) {
  return useQuery({ queryKey: [...CLAVE, 'lista', filtros], queryFn: () => accountsApi.listarFuncionarios(filtros) });
}

export function useDependencias() {
  return useQuery({ queryKey: [...CLAVE, 'dependencias'], queryFn: () => accountsApi.dependencias(), staleTime: 60_000 });
}

export function useFuncionario(id: string | undefined) {
  return useQuery({ queryKey: [...CLAVE, 'detalle', id], queryFn: () => accountsApi.funcionario(id as string), enabled: Boolean(id) });
}

export function useInvitarFuncionario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CrearFuncionarioDto) => accountsApi.invitarFuncionario(dto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useActualizarFuncionario(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: ActualizarFuncionarioDto) => accountsApi.actualizarFuncionario(id, dto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useEstadoFuncionario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CambiarEstadoCuentaDto }) => accountsApi.estadoFuncionario(id, dto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useReenviarInvitacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountsApi.reenviarInvitacion(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

/** La clave temporal solo vive en el estado de la mutacion (no se cachea ni se persiste). */
export function useRestablecerClave() {
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: RestablecerClaveDto }) => accountsApi.restablecerClave(id, dto),
    gcTime: 0,
  });
}
