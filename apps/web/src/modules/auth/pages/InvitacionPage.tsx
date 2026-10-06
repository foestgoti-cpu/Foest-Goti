import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ZodError } from 'zod';
import { useAuth, rutaInicioPorRol } from '../../../lib/auth/AuthProvider';
import { supabase, MENSAJE_SIN_SUPABASE } from '../../../lib/supabase';
import { Card, FormField, Input, Button, Alert, Spinner } from '../../../components/ui';
import { authApi, mensajeDeErrorApi } from '../api';
import { useEnlaceSupabase } from '../hooks/useEnlaceSupabase';
import { AYUDA_PASSWORD, NuevaPasswordSchema } from '../types';

/**
 * Aceptacion de invitacion de funcionario: destino del enlace de
 * `inviteUserByEmail` (`/invitacion#access_token=...&type=invite`). El cliente
 * de Supabase establece la sesion del invitado y aqui define su contrasena con
 * POST /auth/invitacion/aceptar (autenticado), que activa la cuenta y audita.
 */
export function InvitacionPage() {
  const navigate = useNavigate();
  const { user, recargarMe } = useAuth();
  const enlace = useEnlaceSupabase();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<ZodError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = NuevaPasswordSchema.safeParse({ password, confirmar_password: confirmar });
    if (!r.success) {
      setErrores(r.error);
      return;
    }
    setErrores(null);
    setCargando(true);
    try {
      const { usuario, access_token, refresh_token } = await authApi.aceptarInvitacion(r.data.password);
      // Fijar la contrasena invalida la sesion del enlace: se instala la sesion nueva.
      if (supabase) await supabase.auth.setSession({ access_token, refresh_token });
      await recargarMe?.();
      navigate(rutaInicioPorRol(usuario.rol), { replace: true });
    } catch (err) {
      setError(mensajeDeErrorApi(err, 'No fue posible completar la invitacion. El enlace pudo haber vencido; solicite uno nuevo al administrador.'));
    } finally {
      setCargando(false);
    }
  };

  if (!supabase) {
    return (
      <div className="mx-auto max-w-md">
        <Card titulo="Aceptar invitacion">
          <Alert tipo="advertencia">{MENSAJE_SIN_SUPABASE}</Alert>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card titulo="Aceptar invitacion">
        {enlace.errorEnlace ? (
          <Alert tipo="error">
            El enlace de invitacion no es valido o ya vencio (vigencia de 72 horas). Solicite al administrador del FOEST que le envie una
            nueva invitacion.
          </Alert>
        ) : enlace.resolviendo ? (
          <Spinner etiqueta="Validando la invitacion" />
        ) : !enlace.conSesion ? (
          <>
            <Alert tipo="advertencia">
              Esta pagina solo funciona desde el enlace de invitacion enviado a su correo institucional. Si ya definio su contrasena,
              inicie sesion.
            </Alert>
            <p className="mt-4 text-sm">
              <Link to="/login">Ir a iniciar sesion</Link>
            </p>
          </>
        ) : (
          <form onSubmit={(e) => void enviar(e)} noValidate>
            <p className="mb-4 text-sm">
              Bienvenido{user?.email ? `, ${user.email}` : ''}. Para activar su cuenta de funcionario defina una contrasena. No se envian
              contrasenas por correo.
            </p>
            {error && (
              <Alert tipo="error" className="mb-4">
                {error}
              </Alert>
            )}
            <FormField etiqueta="Contrasena" nombre="password" error={errores} obligatorio ayuda={AYUDA_PASSWORD}>
              <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <FormField etiqueta="Confirmar contrasena" nombre="confirmar_password" error={errores} obligatorio>
              <Input type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            </FormField>
            <Button type="submit" bloque cargando={cargando}>
              Activar mi cuenta
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
