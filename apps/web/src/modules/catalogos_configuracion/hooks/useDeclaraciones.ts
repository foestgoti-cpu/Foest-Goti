import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { declaracionesApi } from '../api';

export function useDeclaracionesVigentes() {
  return useQuery({ queryKey: ['declaraciones', 'vigentes'], queryFn: declaracionesApi.vigentes, staleTime: 60_000 });
}

export function useDeclaracionesTodas() {
  return useQuery({ queryKey: ['declaraciones', 'todas'], queryFn: declaracionesApi.todas });
}

export function usePublicarDeclaracion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { codigo: string; titulo: string; texto: string; texto_oficial_confirmado: boolean; motivo?: string }) =>
      declaracionesApi.publicar(p.codigo, { titulo: p.titulo, texto: p.texto, texto_oficial_confirmado: p.texto_oficial_confirmado, motivo: p.motivo, confirmar: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['declaraciones'] }),
  });
}

export function useConsentimientoVigente() {
  return useQuery({ queryKey: ['consentimiento', 'vigente'], queryFn: declaracionesApi.consentimientoVigente, staleTime: 60_000 });
}

export function useVersionesConsentimiento() {
  return useQuery({ queryKey: ['consentimiento', 'versiones'], queryFn: declaracionesApi.versionesConsentimiento });
}

export function usePublicarConsentimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { texto: string; motivo?: string }) => declaracionesApi.publicarConsentimiento({ ...p, confirmar: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['consentimiento'] });
      void qc.invalidateQueries({ queryKey: ['configuracion'] });
    },
  });
}
