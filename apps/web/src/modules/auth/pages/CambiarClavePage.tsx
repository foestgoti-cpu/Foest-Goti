import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { ZodError } from 'zod';
import { useAuth, rutaInicioPorRol } from '../../../lib/auth/AuthProvider';
import { supabase } from '../../../lib/supabase';
import { Card, FormField, Input, Button, Alert, Spinner } from '../../../components/ui';
import { authApi, mensajeDeErrorApi } from '../api';
import { AYUDA_PASSWORD, CambiarClaveFormSchema } from '../types';

/**
 * Cambio de contrasena autenticado (POST /auth/password/change). Cuando la API
 * indica `forzar_cambio_clave`, ProtectedRoute redirige aqui y la navegacion
 * queda bloqueada hasta completar el cambio (o cerrar sesion).
 */
export function CambiarClavePage() {
  const navigate = useNavigate();
  const { session, loading, rol, forzarCambioClave, recargarMe, cerrarSesion } = useAuth();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<ZodError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  if (loading) return <Spinner etiqueta="Verificando sesion" />;
  if (!session) return <Navigate to="/login" replace state={{ desde: '/cambiar-clave' }} />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = CambiarClaveFormSchema.safeParse({ password_actual: actual, password_nueva: nueva, confirmar_password: confirmar });
    if (!r.success) {
      setErrores(r.error);
      return;
    }
    setErrores(null);
    setCargando(true);
    try {
      const nueva = await authApi.cambiarPassword(r.data.password_actual, r.data.password_nueva);
      // Supabase invalida las sesiones anteriores al cambiar la contrasena: se instala la nueva.
      if (supabase) await supabase.auth.setSession({ access_token: nueva.access_token, refresh_token: nueva.refresh_token });
      await recargarMe?.();
      setListo(true);
    } catch (err) {
      setError(mensajeDeErrorApi(err));
    } finally {
      setCargando(false);
    }
  };

  const salir = async () => {
    await cerrarSesion();
    navigate('/login', { replace: true });
  };

  return (
    <div className="mx-auto max-w-md">
      <Card titulo="Cambiar contrasena">
        {listo ? (
          <>
            <Alert tipo="exito">Su contrasena fue actualizada correctamente.</Alert>
            <div className="mt-4">
              <Button bloque onClick={() => navigate(rutaInicioPorRol(rol), { replace: true })}>
                Continuar
              </Button>
            </div>
          </>
        ) : (
          <>
            {forzarCambioClave && (
              <Alert tipo="advertencia" className="mb-4" titulo="Cambio de contrasena obligatorio">
                Su contrasena fue restablecida por un administrador. Por seguridad debe definir una nueva contrasena antes de continuar.
              </Alert>
            )}
            {error && (
              <Alert tipo="error" className="mb-4">
                {error}
              </Alert>
            )}
            <form onSubmit={(e) => void enviar(e)} noValidate>
              <FormField etiqueta="Contrasena actual" nombre="password_actual" error={errores} obligatorio>
                <Input type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
              </FormField>
              <FormField etiqueta="Nueva contrasena" nombre="password_nueva" error={errores} obligatorio ayuda={AYUDA_PASSWORD}>
                <Input type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
              </FormField>
              <FormField etiqueta="Confirmar nueva contrasena" nombre="confirmar_password" error={errores} obligatorio>
                <Input type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
              </FormField>
              <Button type="submit" bloque cargando={cargando}>
                Guardar nueva contrasena
              </Button>
            </form>
            <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
              {!forzarCambioClave && (
                <Button variante="texto" className="min-h-[36px] px-2 py-1 text-sm" onClick={() => navigate(rutaInicioPorRol(rol))}>
                  Volver a mi panel
                </Button>
              )}
              <Button variante="texto" className="min-h-[36px] px-2 py-1 text-sm" onClick={() => void salir()}>
                Cerrar sesion
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
