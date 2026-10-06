import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegistroPage } from '../pages/RegistroPage';

const registrar = vi.fn();
vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, authApi: { ...real.authApi, registrar: (body: unknown) => registrar(body) } };
});

vi.mock('../hooks/useConsentimientoVigente', () => ({
  useConsentimientoVigente: () => ({
    data: { version: 3, texto: 'Texto vigente del consentimiento de prueba' },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

function montar() {
  render(
    <MemoryRouter>
      <RegistroPage />
    </MemoryRouter>,
  );
}

function diligenciarBase() {
  fireEvent.change(screen.getByLabelText(/^Nombres/), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText(/^Apellidos/), { target: { value: 'Perez' } });
  fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), { target: { value: '2000-05-10' } });
  fireEvent.change(screen.getByLabelText(/Correo electronico/), { target: { value: 'ana@foest.test' } });
  fireEvent.change(screen.getByLabelText(/^Contrasena/), { target: { value: 'Clave.Segura1' } });
  fireEvent.change(screen.getByLabelText(/Confirmar contrasena/), { target: { value: 'Clave.Segura1' } });
}

describe('RegistroPage', () => {
  beforeEach(() => registrar.mockReset());

  it('muestra el texto vigente del consentimiento y exige aceptarlo antes de registrar', async () => {
    montar();
    expect(screen.getByText('Texto vigente del consentimiento de prueba')).toBeInTheDocument();
    expect(screen.getByText('Version 3')).toBeInTheDocument();
    diligenciarBase();
    fireEvent.click(screen.getByRole('button', { name: 'Registrarme' }));
    expect(await screen.findByText('Debe aceptar el tratamiento de datos personales para continuar.')).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();
  });

  it('con consentimiento aceptado envia la version vigente y muestra la confirmacion', async () => {
    registrar.mockResolvedValue({ id: 'u1', email: 'ana@foest.test', rol: 'BENEFICIARIO', requiere_verificacion: true });
    montar();
    diligenciarBase();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Registrarme' }));
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    expect(registrar.mock.calls[0]?.[0]).toMatchObject({
      email: 'ana@foest.test',
      nombres: 'Ana',
      aceptar_consentimiento: true,
      version_consentimiento: 3,
    });
    expect(await screen.findByText(/Registro recibido/)).toBeInTheDocument();
  });

  it('para un menor de edad muestra el bloque del acudiente', () => {
    montar();
    const anio = new Date().getUTCFullYear() - 15;
    fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/), { target: { value: `${anio}-01-01` } });
    expect(screen.getByText(/Datos del acudiente/)).toBeInTheDocument();
  });
});
