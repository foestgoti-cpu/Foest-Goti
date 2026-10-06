import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ZodError } from 'zod';
import { useAuth, rutaInicioPorRol } from '../../../lib/auth/AuthProvider';
import { supabase, MENSAJE_SIN_SUPABASE } from '../../../lib/supabase';
import { Card, FormField, Input, Button, Alert, Spinner } from '../../../components/ui';
import { useEnlaceSupabase } from '../hooks/useEnlaceSupabase';
import { AYUDA_PASSWORD, NuevaPasswordSchema } from '../types';

/**
 * Restablecimiento de contrasena: recibe el enlace de recuperacion de Supabase
 * (`/restablecer#access_token=...&type=recovery`). El cliente establece la sesion
 * de recuperacion y aqui se define la nueva contrasena con `auth.updateUser`.
 */
export function RestablecerPage() {
  const navigate = useNavigate();
  const { rol, recargarMe } = useAuth();
  const enlace = useEnlaceSupabase();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<ZodError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = NuevaPasswordSchema.safeParse({ password, confirmar_password: confirmar });
    if (!r.success) {
      setErrores(r.error);
      return;
    }
    setErrores(null);
    if (!supabase) {
      setError(MENSAJE_SIN_SUPABASE);
      return;
    }
    setCargando(true);
    const { error: err } = await supabase.auth.updateUser({ password: r.data.password });
    setCargando(false);
    if (err) {
      setError(
        /same password/i.test(err.message)
          ? 'La nueva contrasena debe ser distinta de la anterior.'
          : 'No fue posible actualizar la contrasena. El enlace pudo haber vencido; solicite uno nuevo.',
      );
      return;
    }
    setListo(true);
    await recargarMe?.();
  };

  if (!supabase) {
    return (
      <div className="mx-auto max-w-md">
        <Card titulo="Restablecer contrasena">
          <Alert tipo="advertencia">{MENSAJE_SIN_SUPABASE}</Alert>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card titulo="Restablecer contrasena">
        {listo ? (
          <>
            <Alert tipo="exito">Su contrasena fue actualizada. Ya puede continuar con su sesion.</Alert>
            <div className="mt-4">
              <Button bloque onClick={() => navigate(rutaInicioPorRol(rol), { replace: true })}>
                Ir a mi panel
              </Button>
            </div>
          </>
        ) : enlace.errorEnlace ? (
          <>
            <Alert tipo="error">
              El enlace de recuperacion no es valido o ya vencio. Solicite uno nuevo desde la opcion de recuperar contrasena.
            </Alert>
            <p className="mt-4 text-sm">
              <Link to="/recuperar">Solicitar un nuevo enlace</Link>
            </p>
          </>
        ) : enlace.resolviendo ? (
          <Spinner etiqueta="Validando el enlace" />
        ) : !enlace.conSesion ? (
          <>
            <Alert tipo="advertencia">
              Esta pagina solo funciona desde el enlace enviado a su correo. Si el enlace vencio, solicite uno nuevo.
            </Alert>
            <p className="mt-4 text-sm">
              <Link to="/recuperar">Solicitar un nuevo enlace</Link>
            </p>
          </>
        ) : (
          <form onSubmit={(e) => void enviar(e)} noValidate>
            {error && (
              <Alert tipo="error" className="mb-4">
                {error}
              </Alert>
            )}
            <FormField etiqueta="Nueva contrasena" nombre="password" error={errores} obligatorio ayuda={AYUDA_PASSWORD}>
              <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <FormField etiqueta="Confirmar nueva contrasena" nombre="confirmar_password" error={errores} obligatorio>
              <Input type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            </FormField>
            <Button type="submit" bloque cargando={cargando}>
              Guardar nueva contrasena
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
