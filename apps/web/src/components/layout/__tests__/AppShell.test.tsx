import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from '../AppShell';
import { TEXTO_INSTITUCIONAL } from '../Header';
import * as auth from '../../../lib/auth/AuthProvider';

const sesionFalsa = {
  access_token: 't',
  user: { id: 'u1', email: 'admin@tocancipa.gov.co', app_metadata: { rol: 'ADMINISTRADOR' } },
} as unknown as Session;

describe('AppShell', () => {
  it('renderiza encabezado institucional, navegacion del rol, contenido y pie legal', () => {
    vi.spyOn(auth, 'useAuth').mockReturnValue({
      session: sesionFalsa,
      user: sesionFalsa.user,
      rol: 'ADMINISTRADOR',
      loading: false,
      configurado: true,
      iniciarSesion: vi.fn(),
      cerrarSesion: vi.fn(),
    });

    const router = createMemoryRouter(
      [{ path: '/admin', element: <AppShell />, children: [{ index: true, element: <p>Contenido de prueba</p> }] }],
      { initialEntries: ['/admin'] },
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByAltText(TEXTO_INSTITUCIONAL)).toHaveAttribute('src', '/logo-municipio.svg');
    expect(screen.getByRole('navigation', { name: 'Navegacion principal' })).toBeInTheDocument();
    expect(screen.getByText('Convocatorias')).toBeInTheDocument();
    expect(screen.getByText('Contenido de prueba')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesion' })).toBeInTheDocument();
    expect(screen.getByText(/Ley 1581 de 2012/)).toBeInTheDocument();
  });
});
