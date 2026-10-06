import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { RolSchema, type Permiso, type Rol } from '@foest/shared';
import { supabase, supabaseConfigurado } from '../supabase';
import { api } from '../api';

/**
 * Contexto de autenticacion: sesion de Supabase, usuario y rol (de `app_metadata.rol`).
 * El rol en el cliente es solo para navegacion/ergonomia; la API vuelve a verificarlo.
 */
export interface AuthState {
  session: Session | null;
  user: User | null;
  rol: Rol | null;
  loading: boolean;
  configurado: boolean;
  iniciarSesion: (email: string, password: string) => Promise<{ error: string | null }>;
  cerrarSesion: () => Promise<void>;
  /** Permisos resueltos por el servidor (GET /auth/me); `undefined` mientras cargan. (modulo auth) */
  permisos?: Permiso[];
  /** `true` cuando la API exige cambiar la contrasena antes de continuar. (modulo auth) */
  forzarCambioClave?: boolean;
  /** Vuelve a consultar GET /auth/me (tras cambiar la clave o aceptar invitacion). (modulo auth) */
  recargarMe?: () => Promise<void>;
}

/** Respuesta minima de GET /auth/me que el proveedor necesita. */
interface MeMinimo {
  permisos: Permiso[];
  forzar_cambio_clave: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function rolDesdeUsuario(user: User | null): Rol | null {
  const claim = (user?.app_metadata as Record<string, unknown> | undefined)?.rol;
  const r = RolSchema.safeParse(claim);
  return r.success ? r.data : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(supabaseConfigurado);
  const [me, setMe] = useState<MeMinimo | null>(null);

  // (modulo auth) Carga permisos y forzar_cambio_clave desde la API cuando cambia el usuario en sesion.
  const usuarioId = session?.user?.id ?? null;
  const recargarMe = useCallback(async () => {
    if (!usuarioId) {
      setMe(null);
      return;
    }
    try {
      const datos = await api.get<MeMinimo>('/auth/me');
      setMe({ permisos: datos.permisos ?? [], forzar_cambio_clave: Boolean(datos.forzar_cambio_clave) });
    } catch {
      // Sin API disponible la sesion sigue siendo valida para navegar; la autorizacion real es del servidor.
    }
  }, [usuarioId]);
  useEffect(() => {
    void recargarMe();
  }, [recargarMe]);

  useEffect(() => {
    if (!supabase) return;
    let activo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!activo) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (activo) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSession(nueva);
      setLoading(false);
    });
    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'La aplicacion no tiene configurado Supabase.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: 'Credenciales invalidas o cuenta no habilitada.' };
    return { error: null };
  }, []);

  const cerrarSesion = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      rol: rolDesdeUsuario(session?.user ?? null),
      loading,
      configurado: supabaseConfigurado,
      iniciarSesion,
      cerrarSesion,
      permisos: me?.permisos,
      forzarCambioClave: me?.forzar_cambio_clave ?? false,
      recargarMe,
    }),
    [session, loading, iniciarSesion, cerrarSesion, me, recargarMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

/** Ruta de inicio segun el rol. */
export function rutaInicioPorRol(rol: Rol | null): string {
  switch (rol) {
    case 'ADMINISTRADOR':
      return '/admin';
    case 'FUNCIONARIO':
      return '/funcionario';
    case 'BENEFICIARIO':
      return '/beneficiario';
    default:
      return '/';
  }
}
