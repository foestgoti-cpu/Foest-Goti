import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // No reintentar errores de autorizacion/validacion.
        const status = (error as { status?: number } | null)?.status;
        if (status && [401, 403, 404, 409, 422].includes(status)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
