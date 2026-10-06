import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PerfilBeneficiarioDto, SolicitudHabeasDataDto } from '@foest/shared';
import { accountsApi } from '../api';

const CLAVE = ['accounts', 'perfil'] as const;

export function usePerfilPropio() {
  return useQuery({ queryKey: [...CLAVE, 'me'], queryFn: () => accountsApi.perfilPropio() });
}

export function useActualizarPerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: PerfilBeneficiarioDto) => accountsApi.actualizarPerfilPropio(dto),
    onSuccess: (perfil) => {
      qc.setQueryData([...CLAVE, 'me'], perfil);
      void qc.invalidateQueries({ queryKey: CLAVE });
    },
  });
}

export function useConsentimientos() {
  return useQuery({ queryKey: [...CLAVE, 'consentimientos'], queryFn: () => accountsApi.consentimientosPropios() });
}

export function useAceptarConsentimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => accountsApi.aceptarConsentimiento(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useHabeasDataPropias() {
  return useQuery({ queryKey: [...CLAVE, 'habeas-data'], queryFn: () => accountsApi.habeasDataPropias() });
}

export function useRadicarHabeasData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SolicitudHabeasDataDto) => accountsApi.radicarHabeasData(dto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...CLAVE, 'habeas-data'] }),
  });
}
