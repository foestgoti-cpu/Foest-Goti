import { Link, Outlet } from 'react-router-dom';
import { useAuth, rutaInicioPorRol } from '../../lib/auth/AuthProvider';
import { Header } from './Header';
import { Footer } from './Footer';

/** Armazon publico: encabezado institucional, contenido y pie legal (sin barra lateral). */
export function PublicLayout() {
  const { session, rol } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <Header
        derecha={
          session ? (
            <Link to={rutaInicioPorRol(rol)}>Ir a mi panel</Link>
          ) : (
            <>
              <Link to="/login">Iniciar sesion</Link>
              <Link to="/registro">Registrarse</Link>
            </>
          )
        }
      />
      <main id="contenido" className="mx-auto w-full max-w-content flex-1 px-gutter py-8" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
