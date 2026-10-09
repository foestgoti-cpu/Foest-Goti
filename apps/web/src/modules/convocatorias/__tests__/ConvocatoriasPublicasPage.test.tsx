import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConvocatoriasPublicasPage } from '../pages/ConvocatoriasPublicasPage';
import { convocatoriasApi } from '../api';

vi.mock('../api', () => ({
  convocatoriasApi: { listarPublicas: vi.fn() },
}));

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConvocatoriasPublicasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ConvocatoriasPublicasPage (/convocatorias)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra las convocatorias abiertas devueltas por la API publica', async () => {
    vi.mocked(convocatoriasApi.listarPublicas).mockResolvedValue({
      data: [
        {
          id: '7b1a6f2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
          nombre: 'Convocatoria 2026-2',
          anio: 2026,
          semestre: 2,
          descripcion: '',
          fecha_apertura: '2026-08-01T05:00:00.000Z',
          fecha_cierre: '2026-08-31',
          fecha_cierre_presentada: '2026-09-01T04:59:59.000Z',
          dias_restantes: 20,
          beneficios: [],
        },
      ],
      proxima_apertura_estimada: null,
    });
    renderizar();
    expect(await screen.findByText('Convocatoria 2026-2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Convocatorias abiertas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio de sesión' })).toHaveAttribute('href', '/login');
  });

  it('sin convocatorias abiertas muestra la fecha estimada de proxima apertura', async () => {
    vi.mocked(convocatoriasApi.listarPublicas).mockResolvedValue({ data: [], proxima_apertura_estimada: '2027-02-01' });
    renderizar();
    expect(await screen.findByText('No hay convocatorias abiertas en este momento')).toBeInTheDocument();
    expect(screen.getByText(/01 de febrero de 2027/)).toBeInTheDocument();
  });
});
