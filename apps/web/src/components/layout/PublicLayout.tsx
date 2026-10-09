import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth, rutaInicioPorRol } from '../../lib/auth/AuthProvider';
import { Header } from './Header';
import { Footer } from './Footer';

/** Rutas con fondo de ancho completo (inicio de sesion): sin contenedor `max-w-content` en el main. */
const RUTAS_ANCHO_COMPLETO = ['/', '/login'];

/** Armazon publico: encabezado institucional, contenido y pie legal (sin barra lateral). */
export function PublicLayout() {
  const { session, rol } = useAuth();
  const { pathname } = useLocation();
  const anchoCompleto = RUTAS_ANCHO_COMPLETO.includes(pathname);
  const derecha = session ? (
    <Link to={rutaInicioPorRol(rol)}>Ir a mi panel</Link>
  ) : anchoCompleto ? undefined : (
    <>
      <Link to="/login">Iniciar sesión</Link>
      <Link to="/registro">Registrarse</Link>
    </>
  );
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <Header derecha={derecha} />
      <main
        id="contenido"
        className={anchoCompleto ? 'w-full flex-1 bg-primary-10' : 'mx-auto w-full max-w-content flex-1 px-gutter py-8'}
        tabIndex={-1}
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
