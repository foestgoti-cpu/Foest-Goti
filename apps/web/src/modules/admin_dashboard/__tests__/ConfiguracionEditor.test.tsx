import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiRequestError } from '../../../lib/api';
import type { ConfiguracionItem } from '../types';

const actualizar = vi.fn();
const listar = vi.fn();
vi.mock('../api', () => ({
  configuracionApi: { listar: (...a: unknown[]) => listar(...a), actualizar: (...a: unknown[]) => actualizar(...a) },
  festivosApi: { listar: vi.fn(), crear: vi.fn(), eliminar: vi.fn() },
}));

import { ConfiguracionEditor } from '../components/ConfiguracionEditor';
import { calcularDiferencias } from '../components/AuditoriaLogViewer';

const fila: ConfiguracionItem = {
  clave: 'ALERTA_CIERRE_DIAS',
  valor: '7',
  tipo: 'INT',
  categoria: 'ALERTAS',
  descripcion: 'Dias naturales antes del cierre',
  valor_defecto: '7',
  valor_min: '1',
  valor_max: '30',
  pendiente_confirmar: false,
  version: 3,
  actualizado_por: null,
  actualizado_en: '2026-01-01T00:00:00Z',
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConfiguracionEditor />
    </QueryClientProvider>,
  );
}

describe('ConfiguracionEditor', () => {
  beforeEach(() => {
    listar.mockReset();
    listar.mockResolvedValue({ data: [fila], page: 1, page_size: 1, total: 1 });
    actualizar.mockReset();
  });

  it('exige doble intencion antes de enviar y envia version + confirmar', async () => {
    actualizar.mockResolvedValue({ ...fila, valor: '10', version: 4 });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const guardar = screen.getByRole('button', { name: 'Guardar cambio' });
    expect(guardar).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/Escriba/), { target: { value: 'CONFIRMAR' } });
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(actualizar).toHaveBeenCalledWith('ALERTA_CIERRE_DIAS', { valor: 10, version: 3, motivo: undefined, confirmar: true }));
    expect(await screen.findByText(/se actualizo correctamente/)).toBeInTheDocument();
  });

  it('ante 409 VERSION_DESACTUALIZADA muestra el valor vigente y ofrece recargar', async () => {
    actualizar.mockRejectedValue(new ApiRequestError(409, { code: 'VERSION_DESACTUALIZADA', message: 'cambio', details: { valor_actual: '9', version_actual: 4 } }));
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/Escriba/), { target: { value: 'CONFIRMAR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));
    expect(await screen.findByText('Version desactualizada')).toBeInTheDocument();
    expect(screen.getByText(/version 4/)).toBeInTheDocument();
    const llamadasAntes = listar.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Recargar valores' }));
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(llamadasAntes));
  });
});

describe('calcularDiferencias (visor de auditoria)', () => {
  it('marca solo los campos modificados', () => {
    const d = calcularDiferencias({ valor: '7', version: 3 }, { valor: '10', version: 4, nuevo: true });
    expect(d.find((x) => x.campo === 'valor')).toMatchObject({ antes: '"7"', despues: '"10"', cambio: true });
    expect(d.find((x) => x.campo === 'nuevo')).toMatchObject({ antes: '', cambio: true });
    expect(calcularDiferencias(null, null)).toEqual([]);
  });
});
