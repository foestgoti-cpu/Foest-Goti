import type { RutasModulo } from '../index';
import { LoginPage } from './pages/LoginPage';
import { RegistroPage } from './pages/RegistroPage';
import { RecuperarPage } from './pages/RecuperarPage';
import { RestablecerPage } from './pages/RestablecerPage';
import { VerificarCorreoPage } from './pages/VerificarCorreoPage';
import { InvitacionPage } from './pages/InvitacionPage';
import { CambiarClavePage } from './pages/CambiarClavePage';

/**
 * Rutas del modulo auth (todas bajo PublicLayout). /cambiar-clave exige sesion
 * (la pagina redirige a /login si no la hay) y es el destino obligatorio cuando
 * `forzar_cambio_clave` es true (ver lib/auth/ProtectedRoute).
 */
export const authRoutes: RutasModulo = {
  rutasPublicas: [
    { path: '/login', element: <LoginPage /> },
    { path: '/registro', element: <RegistroPage /> },
    { path: '/recuperar', element: <RecuperarPage /> },
    { path: '/restablecer', element: <RestablecerPage /> },
    { path: '/verificar-correo', element: <VerificarCorreoPage /> },
    { path: '/invitacion', element: <InvitacionPage /> },
    { path: '/cambiar-clave', element: <CambiarClavePage /> },
  ],
};
