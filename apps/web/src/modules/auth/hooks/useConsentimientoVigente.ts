import { useQuery } from '@tanstack/react-query';
import { authApi } from '../api';

/** Texto y version vigente del consentimiento de datos (publico, para el registro). */
export function useConsentimientoVigente() {
  return useQuery({
    queryKey: ['auth', 'consentimiento', 'vigente'],
    queryFn: () => authApi.consentimientoVigente(),
    staleTime: 5 * 60 * 1000,
  });
}
