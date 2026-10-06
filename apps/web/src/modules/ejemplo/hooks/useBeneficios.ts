import { useQuery } from '@tanstack/react-query';
import { ejemploApi } from '../api';

/** Hook de datos del modulo con TanStack Query. */
export function useBeneficios(page: number) {
  return useQuery({
    queryKey: ['ejemplo', 'beneficios', page],
    queryFn: () => ejemploApi.listarBeneficios(page),
  });
}
