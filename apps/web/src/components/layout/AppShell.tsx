import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { Header } from './Header';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import { Button } from '../ui/Button';
import { NotificacionesCampana } from '../../modules/beneficiario_dashboard/components/NotificacionesCampana';

/**
 * Armazon de la aplicacion autenticada: encabezado institucional, barra lateral
 * por rol, contenido y pie de pagina con leyenda legal.
 */
export function AppShell() {
  const { user, rol, cerrarSesion } = useAuth();
  const navigate = useNavigate();

  const salir = async () => {
    await cerrarSesion();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <Header
        derecha={
          <>
            {user?.email && (
              <span className="hidden sm:inline" aria-label="Usuario en sesion">
                {user.email}
              </span>
            )}
            <NotificacionesCampana />
            <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={() => void salir()}>
              Cerrar sesion
            </Button>
          </>
        }
      />
      <div className="mx-auto flex w-full max-w-content flex-1 flex-col md:flex-row">
        {rol && <Sidebar rol={rol} />}
        <main id="contenido" className="flex-1 px-gutter py-6" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
