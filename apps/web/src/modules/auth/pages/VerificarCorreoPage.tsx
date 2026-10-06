import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmailSchema } from '@foest/shared';
import { useAuth, rutaInicioPorRol } from '../../../lib/auth/AuthProvider';
import { Card, FormField, Input, Button, Alert, Spinner } from '../../../components/ui';
import { authApi, mensajeDeErrorApi } from '../api';
import { useEnlaceSupabase } from '../hooks/useEnlaceSupabase';

/**
 * Verificacion de correo: destino del enlace de confirmacion de Supabase
 * (`/verificar-correo#access_token=...&type=signup`). Tambien permite reenviar
 * el enlace (POST /auth/verify-email/resend, respuesta siempre generica).
 */
export function VerificarCorreoPage() {
  const { rol } = useAuth();
  const enlace = useEnlaceSupabase();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);

  const reenviar = async (e: FormEvent) => {
    e.preventDefault();
    const r = EmailSchema.safeParse(email);
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? 'Correo no valido');
      return;
    }
    setError(null);
    setCargando(true);
    try {
      await authApi.reenviarVerificacion(r.data);
      setEnviado(true);
    } catch (err) {
      setError(mensajeDeErrorApi(err));
    } finally {
      setCargando(false);
    }
  };

  const verificado = !enlace.errorEnlace && enlace.conSesion && enlace.tipo === 'signup';

  return (
    <div className="mx-auto max-w-md">
      <Card titulo="Verificacion de correo">
        {enlace.resolviendo ? (
          <Spinner etiqueta="Validando el enlace" />
        ) : verificado ? (
          <>
            <Alert tipo="exito">Su correo fue confirmado correctamente. Su cuenta ya esta activa.</Alert>
            <p className="mt-4 text-sm">
              <Link to={rutaInicioPorRol(rol)}>Ir a mi panel</Link>
            </p>
          </>
        ) : (
          <>
            {enlace.errorEnlace ? (
              <Alert tipo="error" className="mb-4">
                El enlace de verificacion no es valido o ya vencio. Solicite uno nuevo con el formulario siguiente.
              </Alert>
            ) : (
              <p className="mb-4 text-sm">
                Si no recibio el correo de confirmacion o el enlace vencio, indique su correo y le enviaremos uno nuevo. Revise tambien
                la carpeta de correo no deseado.
              </p>
            )}
            {enviado ? (
              <Alert tipo="info">Si el correo esta registrado y pendiente de verificacion, recibira un nuevo enlace.</Alert>
            ) : (
              <form onSubmit={(e) => void reenviar(e)} noValidate>
                <FormField etiqueta="Correo electronico" nombre="email" error={error} obligatorio>
                  <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </FormField>
                <Button type="submit" bloque cargando={cargando}>
                  Reenviar enlace de verificacion
                </Button>
              </form>
            )}
            <p className="mt-4 text-sm">
              <Link to="/login">Volver a iniciar sesion</Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
