import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginSchema } from '@foest/shared';
import type { ZodError } from 'zod';
import { useAuth, rutaInicioPorRol } from '../../../lib/auth/AuthProvider';
import { supabase, MENSAJE_SIN_SUPABASE } from '../../../lib/supabase';
import { ApiRequestError } from '../../../lib/api';
import { FormField, Input, Button, Alert } from '../../../components/ui';
import { authApi, mensajeDeErrorApi } from '../api';

/**
 * Inicio de sesion (`/` y `/login`, sin convocatorias; el banner enlaza a /convocatorias): POST /auth/login (contadores de fuerza bruta y auditoria en la API)
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
  const campoCorreo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campoCorreo.current?.focus();
  }, []);

  if (session && rol && !manejandoIngreso) return <Navigate to={rutaInicioPorRol(rol)} replace />;

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
    <div className="mx-auto grid w-full max-w-content gap-10 px-gutter py-10 lg:grid-cols-2 lg:items-start lg:gap-16 lg:py-16">
      <section aria-labelledby="bienvenida" className="lg:pt-6">
        <h1 id="bienvenida" className="text-4xl font-semibold leading-tight text-primary lg:text-5xl">
          ¡Te damos la bienvenida a FOEST!
        </h1>
        <p className="mt-4 text-xl font-medium text-ink">Fondo para la Educación Superior de Tocancipá</p>
        <p className="mt-2 max-w-md text-base text-ink">Ingrese con su cuenta para continuar con su solicitud de apoyo.</p>
        <DecoracionInicio />
      </section>

      <div className="w-full lg:max-w-xl lg:justify-self-end">
        <div className="rounded-2xl border border-primary-20 bg-white p-6 shadow-md sm:p-8">
          <h2 className="mb-6 text-xl font-semibold">Ingresa a tu cuenta</h2>
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
                  <Link to="/verificar-correo">Solicitar un nuevo enlace de verificación</Link>
                </p>
              )}
            </Alert>
          )}
          <form onSubmit={(e) => void enviar(e)} noValidate>
            <FormField etiqueta="Correo electrónico" nombre="email" error={errores} obligatorio>
              <Input
                ref={campoCorreo}
                type="email"
                autoComplete="email"
                placeholder="ejemplo@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <FormField etiqueta="Contraseña" nombre="password" error={errores} obligatorio>
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <Button type="submit" bloque disabled={!configurado || cargando || !email || !password} aria-busy={cargando || undefined}>
              {cargando ? 'Ingresando…' : 'Iniciar sesión'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            <Link to="/recuperar">¿Olvidó su contraseña?</Link>
          </p>
          <p className="mt-2 text-center text-sm">
            ¿Aún no tiene cuenta? <Link to="/registro">Regístrese</Link>
          </p>
        </div>

        <Link
          to="/convocatorias"
          className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-primary px-6 py-5 text-white no-underline hover:bg-primary/90 hover:text-white hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span className="text-base font-semibold">¿Aún no sabe a qué convocatoria puede postular?</span>
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" focusable="false" className="shrink-0">
            <circle cx="28" cy="28" r="26" className="fill-white" />
            <text x="28" y="39" textAnchor="middle" fontSize="32" fontWeight="700" className="fill-primary">
              ?
            </text>
          </svg>
        </Link>
      </div>
    </div>
  );
}

/** Ilustracion sobria hecha con formas: circulos en tintes de azul y un birrete. */
function DecoracionInicio() {
  return (
    <svg viewBox="0 0 320 240" className="mt-8 hidden h-auto w-full max-w-xs lg:block" aria-hidden="true" focusable="false">
      <circle cx="140" cy="130" r="95" className="fill-primary-20" />
      <circle cx="250" cy="48" r="28" className="fill-primary-20" />
      <circle cx="52" cy="40" r="12" className="fill-white" />
      <circle cx="285" cy="170" r="16" className="fill-white" />
      <path d="M70 118 L140 86 L210 118 L140 150 Z" className="fill-primary" />
      <path d="M100 136 V166 C100 182 180 182 180 166 V136" className="fill-none stroke-primary" strokeWidth="8" strokeLinejoin="round" />
      <path d="M210 118 V158" className="stroke-primary" strokeWidth="6" strokeLinecap="round" />
      <circle cx="210" cy="164" r="7" className="fill-primary" />
    </svg>
  );
}
