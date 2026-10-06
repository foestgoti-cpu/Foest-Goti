import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Rol } from '@foest/shared';
import { useAuth } from './AuthProvider';
import { Spinner } from '../../components/ui/Spinner';

/**
 * Protege un arbol de rutas por rol.
 *   <Route element={<ProtectedRoute roles={['ADMINISTRADOR']} />}> ... </Route>
 * Sin sesion -> /login (conserva la ruta de origen). Rol no permitido -> /403.
 */
export function ProtectedRoute({ roles }: { roles?: Rol[] }) {
  const { session, rol, loading, forzarCambioClave } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
        <Spinner etiqueta="Verificando sesion" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  }
  if (roles && roles.length > 0 && (!rol || !roles.includes(rol))) {
    return <Navigate to="/403" replace />;
  }
  // (modulo auth) Cambio de contrasena obligatorio: bloquea toda navegacion autenticada.
  if (forzarCambioClave && location.pathname !== '/cambiar-clave') {
    return <Navigate to="/cambiar-clave" replace />;
  }
  return <Outlet />;
}
