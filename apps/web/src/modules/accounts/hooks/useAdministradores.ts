import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CambiarEstadoCuentaDto } from '@foest/shared';
import { accountsApi } from '../api';

const CLAVE = ['accounts', 'administradores'] as const;

export function useAdministradores(page: number) {
  return useQuery({ queryKey: [...CLAVE, page], queryFn: () => accountsApi.listarAdministradores(page) });
}

export function useEstadoAdministrador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CambiarEstadoCuentaDto }) => accountsApi.estadoAdministrador(id, dto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
  });
}
