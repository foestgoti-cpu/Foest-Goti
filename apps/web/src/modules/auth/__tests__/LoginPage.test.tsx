import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ApiRequestError } from '../../../lib/api';
import { LoginPage } from '../pages/LoginPage';

const setSession = vi.fn(async (_args: unknown) => ({ data: {}, error: null }));
vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: { setSession: (args: unknown) => setSession(args) } },
  supabaseConfigurado: true,
  MENSAJE_SIN_SUPABASE: 'sin supabase',
}));

const login = vi.fn();
const listarPublicas = vi.fn();
vi.mock('../../convocatorias/api', () => ({ convocatoriasApi: { listarPublicas: () => listarPublicas() } }));
vi.mock('../api', async () => {
  const real = await vi.importActual<typeof import('../api')>('../api');
  return { ...real, authApi: { ...real.authApi, login: (email: string, password: string) => login(email, password) } };
});

vi.mock('../../../lib/auth/AuthProvider', async () => {
  const real = await vi.importActual<typeof import('../../../lib/auth/AuthProvider')>('../../../lib/auth/AuthProvider');
  return {
    ...real,
    useAuth: () => ({ session: null, user: null, rol: null, loading: false, configurado: true, iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }),
  };
});

function montar(ruta = '/login') {
  const router = createMemoryRouter(
    [
      { path: '/', element: <LoginPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/convocatorias', element: <p>Listado de convocatorias</p> },
      { path: '/beneficiario', element: <p>Panel del beneficiario</p> },
      { path: '/cambiar-clave', element: <p>Cambio de clave obligatorio</p> },
    ],
    { initialEntries: [ruta] },
  );
  render(<RouterProvider router={router} />);
}

function diligenciarYEnviar(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

const sesion = (rol: string, forzar: boolean) => ({
  access_token: 'a',
  refresh_token: 'r',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: null,
  usuario: { id: 'u1', email: 'x@foest.test', rol, forzar_cambio_clave: forzar },
});

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset();
    setSession.mockClear();
  });

  it('muestra un mensaje generico ante credenciales invalidas (401)', async () => {
    login.mockRejectedValue(new ApiRequestError(401, { code: 'CREDENCIALES_INVALIDAS', message: 'Credenciales invalidas' }));
    montar();
    diligenciarYEnviar('ben@foest.test', 'Clave.Mala1');
    expect(await screen.findByText('Correo o contrasena incorrectos.')).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();
  });

  it('informa cuenta inactiva (403 CUENTA_INACTIVA) y bloqueo temporal (429)', async () => {
    login.mockRejectedValueOnce(new ApiRequestError(403, { code: 'CUENTA_INACTIVA', message: 'inactiva' }));
    montar();
    diligenciarYEnviar('ben@foest.test', 'Clave.Segura1');
    expect(await screen.findByText(/Su cuenta se encuentra inactiva/)).toBeInTheDocument();

    login.mockRejectedValueOnce(new ApiRequestError(429, { code: 'CUENTA_BLOQUEADA_TEMPORAL', message: 'bloqueada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText(/quedo bloqueado temporalmente/)).toBeInTheDocument();
  });

  it('con credenciales validas instala la sesion y redirige segun el rol', async () => {
    login.mockResolvedValue(sesion('BENEFICIARIO', false));
    montar();
    diligenciarYEnviar('ben@foest.test', 'Clave.Segura1');
    await waitFor(() => expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' }));
    expect(await screen.findByText('Panel del beneficiario')).toBeInTheDocument();
  });

  it('con forzar_cambio_clave redirige a /cambiar-clave', async () => {
    login.mockResolvedValue(sesion('FUNCIONARIO', true));
    montar();
    diligenciarYEnviar('f@foest.test', 'Clave.Segura1');
    expect(await screen.findByText('Cambio de clave obligatorio')).toBeInTheDocument();
  });

  it('en / solo es inicio de sesion: no solicita convocatorias y el banner enlaza a /convocatorias', () => {
    montar('/');
    expect(screen.getByRole('heading', { name: '¡Te damos la bienvenida a FOEST!' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveFocus();
    expect(listarPublicas).not.toHaveBeenCalled();
    const banner = screen.getByRole('link', { name: /¿Aún no sabe a qué convocatoria puede postular?/ });
    expect(banner).toHaveAttribute('href', '/convocatorias');
    expect(screen.getByRole('link', { name: 'Regístrese' })).toHaveAttribute('href', '/registro');
    expect(screen.getByRole('link', { name: '¿Olvidó su contraseña?' })).toHaveAttribute('href', '/recuperar');
  });
});
