import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import type { Rol } from '@foest/shared';
import * as auth from '../../../lib/auth/AuthProvider';
import { rolesPermissionsApi } from '../api';
import { RoleGuard } from '../components/RoleGuard';

function sesionDe(rol: Rol) {
  const user = { id: `u-${rol}`, email: `${rol.toLowerCase()}@foest.test`, app_metadata: { rol } };
  return { access_token: 't', user } as unknown as Session;
}

function montar(rol: Rol, ui: React.ReactElement) {
  const session = sesionDe(rol);
  vi.spyOn(auth, 'useAuth').mockReturnValue({
    session,
    user: session.user,
    rol,
    loading: false,
    configurado: true,
    iniciarSesion: vi.fn(),
    cerrarSesion: vi.fn(),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('RoleGuard / usePermissions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('oculta el contenido al rol sin el permiso (copia local de la matriz) y muestra el fallback', async () => {
    vi.spyOn(rolesPermissionsApi, 'permisosMios').mockRejectedValue(new Error('sin red'));
    montar(
      'BENEFICIARIO',
      <RoleGuard permisos={['evaluacion:dictaminar']} fallback={<p>No disponible</p>}>
        <button>Dictaminar</button>
      </RoleGuard>,
    );
    expect(screen.queryByRole('button', { name: 'Dictaminar' })).not.toBeInTheDocument();
    expect(screen.getByText('No disponible')).toBeInTheDocument();
  });

  it('muestra el contenido al rol con el permiso segun el servidor', async () => {
    vi.spyOn(rolesPermissionsApi, 'permisosMios').mockResolvedValue({
      usuario_id: 'u-FUNCIONARIO',
      rol: 'FUNCIONARIO',
      permisos: ['evaluacion:dictaminar'],
    });
    montar(
      'FUNCIONARIO',
      <RoleGuard permisos={['evaluacion:dictaminar']}>
        <button>Dictaminar</button>
      </RoleGuard>,
    );
    expect(await screen.findByRole('button', { name: 'Dictaminar' })).toBeInTheDocument();
  });

  it('respeta la lista de permisos del servidor aunque la copia local difiera', async () => {
    // El servidor no concede el permiso -> se oculta aunque la matriz local lo conceda.
    vi.spyOn(rolesPermissionsApi, 'permisosMios').mockResolvedValue({ usuario_id: 'u-ADMINISTRADOR', rol: 'ADMINISTRADOR', permisos: [] });
    montar(
      'ADMINISTRADOR',
      <RoleGuard permisos={['rol:consultar']} fallback={<p>Oculto</p>}>
        <p>Visible</p>
      </RoleGuard>,
    );
    expect(await screen.findByText('Oculto')).toBeInTheDocument();
    expect(screen.queryByText('Visible')).not.toBeInTheDocument();
  });

  it('filtra por rol y por modo "alguno"', async () => {
    vi.spyOn(rolesPermissionsApi, 'permisosMios').mockRejectedValue(new Error('sin red'));
    montar(
      'ADMINISTRADOR',
      <>
        <RoleGuard roles={['FUNCIONARIO']}>
          <p>Solo funcionario</p>
        </RoleGuard>
        <RoleGuard permisos={['evaluacion:dictaminar', 'convocatoria:crear']} modo="alguno">
          <p>Alguno</p>
        </RoleGuard>
        <RoleGuard permisos={['evaluacion:dictaminar', 'convocatoria:crear']}>
          <p>Todos</p>
        </RoleGuard>
      </>,
    );
    expect(screen.queryByText('Solo funcionario')).not.toBeInTheDocument();
    expect(screen.getByText('Alguno')).toBeInTheDocument();
    expect(screen.queryByText('Todos')).not.toBeInTheDocument();
  });
});
