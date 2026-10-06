import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginSchema } from '@foest/shared';
import type { ZodError } from 'zod';
import { useAuth, rutaInicioPorRol } from '../../../lib/auth/AuthProvider';
import { supabase, MENSAJE_SIN_SUPABASE } from '../../../lib/supabase';
import { ApiRequestError } from '../../../lib/api';
import { Card, FormField, Input, Button, Alert } from '../../../components/ui';
import { authApi, mensajeDeErrorApi } from '../api';

/**
 * Inicio de sesion: POST /auth/login (contadores de fuerza bruta y auditoria en la API)
 * y luego la sesion se instala en el cliente de Supabase para que AuthProvider y
 * lib/api la usen. Mensajes genericos ante credenciales invalidas.
 */
export function LoginPage() {
  const { session, rol, configurado } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<ZodError | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<{ texto: string; codigo?: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [manejandoIngreso, setManejandoIngreso] = useState(false);

  if (session && !manejandoIngreso) return <Navigate to={rutaInicioPorRol(rol)} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = LoginSchema.safeParse({ email, password });
    if (!r.success) {
      setErrores(r.error);
      return;
    }
    setErrores(null);
    if (!supabase) {
      setErrorGeneral({ texto: MENSAJE_SIN_SUPABASE });
      return;
    }
    setCargando(true);
    try {
      const respuesta = await authApi.login(r.data.email, r.data.password);
      setManejandoIngreso(true);
      const { error } = await supabase.auth.setSession({
        access_token: respuesta.access_token,
        refresh_token: respuesta.refresh_token,
      });
      if (error) throw new Error('No fue posible establecer la sesion');
      const desde = (location.state as { desde?: string } | null)?.desde;
      const destino = respuesta.usuario.forzar_cambio_clave ? '/cambiar-clave' : desde ?? rutaInicioPorRol(respuesta.usuario.rol);
      navigate(destino, { replace: true });
    } catch (err) {
      setManejandoIngreso(false);
      setErrorGeneral({ texto: mensajeDeErrorApi(err), codigo: err instanceof ApiRequestError ? err.code : undefined });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card titulo="Iniciar sesion">
        {!configurado && (
          <Alert tipo="advertencia" className="mb-4">
            {MENSAJE_SIN_SUPABASE}
          </Alert>
        )}
        {errorGeneral && (
          <Alert tipo="error" className="mb-4">
            <p>{errorGeneral.texto}</p>
            {errorGeneral.codigo === 'EMAIL_NO_VERIFICADO' && (
              <p className="mt-2 text-sm">
                <Link to="/verificar-correo">Solicitar un nuevo enlace de verificacion</Link>
              </p>
            )}
          </Alert>
        )}
        <form onSubmit={(e) => void enviar(e)} noValidate>
          <FormField etiqueta="Correo electronico" nombre="email" error={errores} obligatorio>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField etiqueta="Contrasena" nombre="password" error={errores} obligatorio>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <Button type="submit" bloque cargando={cargando} disabled={!configurado}>
            Ingresar
          </Button>
        </form>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          <Link to="/recuperar">Olvide mi contrasena</Link>
          <Link to="/registro">Crear cuenta de beneficiario</Link>
        </div>
      </Card>
    </div>
  );
}
