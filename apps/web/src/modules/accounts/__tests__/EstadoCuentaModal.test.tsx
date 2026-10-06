import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApiRequestError } from '../../../lib/api';
import { EstadoCuentaModal } from '../components/EstadoCuentaModal';

describe('EstadoCuentaModal', () => {
  it('exige doble intencion y motivo de 15 caracteres antes de deshabilitar', () => {
    const onConfirmar = vi.fn();
    render(<EstadoCuentaModal abierto etiquetaCuenta="Carlos Ruiz" activar={false} onCerrar={() => undefined} onConfirmar={onConfirmar} />);
    const boton = screen.getByRole('button', { name: 'Deshabilitar' });
    expect(boton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/Escriba/), { target: { value: 'DESHABILITAR' } });
    expect(boton).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'corto' } });
    fireEvent.click(boton);
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/al menos 15 caracteres/);

    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Retiro de la entidad por terminacion del contrato' } });
    fireEvent.click(boton);
    expect(onConfirmar).toHaveBeenCalledWith({ activo: false, motivo: 'Retiro de la entidad por terminacion del contrato' });
  });

  it('muestra los expedientes pendientes del 409 ASIGNACIONES_PENDIENTES y ofrece forzar', () => {
    const error = new ApiRequestError(409, {
      code: 'ASIGNACIONES_PENDIENTES',
      message: 'pendientes',
      details: {
        regla: 'REASSIGNMENT_REQUIRED',
        asignaciones_activas: 1,
        pendientes: 2,
        expedientes: [
          { postulacion_id: 'aaaaaaaa-1', convocatoria_id: 'c1', convocatoria_nombre: 'Convocatoria 2026-1', estado: 'PENDIENTE' },
          { postulacion_id: 'bbbbbbbb-2', convocatoria_id: 'c1', convocatoria_nombre: 'Convocatoria 2026-1', estado: 'EN_EVALUACION' },
        ],
      },
    });
    render(<EstadoCuentaModal abierto etiquetaCuenta="Carlos Ruiz" activar={false} permiteForzar error={error} onCerrar={() => undefined} onConfirmar={() => undefined} />);
    expect(screen.getByTestId('aviso-asignaciones-pendientes')).toBeInTheDocument();
    expect(screen.getAllByText('Convocatoria 2026-1')).toHaveLength(2);
    expect(screen.getByText('En evaluacion')).toBeInTheDocument();
    expect(screen.getByLabelText(/Forzar la deshabilitacion/)).toBeInTheDocument();
  });
});
