import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CambiarEstadoCuentaDto, CorregirDocumentoDto, ResolverHabeasDataDto } from '@foest/shared';
import { accountsApi, type FiltrosBeneficiarios } from '../api';

const CLAVE = ['accounts', 'beneficiarios'] as const;
const CLAVE_HABEAS = ['accounts', 'habeas-data'] as const;

export function useBeneficiarios(filtros: FiltrosBeneficiarios) {
  return useQuery({ queryKey: [...CLAVE, 'lista', filtros], queryFn: () => accountsApi.listarBeneficiarios(filtros) });
}

export function useBeneficiario(id: string | undefined) {
  return useQuery({ queryKey: [...CLAVE, 'detalle', id], queryFn: () => accountsApi.beneficiario(id as string), enabled: Boolean(id) });
}

export function useEstadoBeneficiario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CambiarEstadoCuentaDto }) => accountsApi.estadoBeneficiario(id, dto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useCorregirDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CorregirDocumentoDto }) => accountsApi.corregirDocumento(id, dto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useBandejaHabeasData(page: number, estado?: string) {
  return useQuery({ queryKey: [...CLAVE_HABEAS, 'bandeja', page, estado], queryFn: () => accountsApi.bandejaHabeasData(page, estado) });
}

export function useResolverHabeasData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ResolverHabeasDataDto }) => accountsApi.resolverHabeasData(id, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLAVE_HABEAS });
      void qc.invalidateQueries({ queryKey: CLAVE });
    },
  });
}
