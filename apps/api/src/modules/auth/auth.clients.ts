import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, requireSupabaseEnv } from '../../config/env';

/**
 * Cliente ANON de Supabase en el servidor (sin sesion persistida) para los
 * flujos de Supabase Auth que no requieren service role: signInWithPassword,
 * signUp, refreshSession, resetPasswordForEmail, resend. Se crea de forma
 * perezosa para que la API arranque sin credenciales.
 */
let anonSingleton: SupabaseClient | null = null;

export function getSupabaseAnon(): SupabaseClient {
  if (anonSingleton) return anonSingleton;
  const { url, anonKey } = requireSupabaseEnv();
  anonSingleton = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'foest-api/auth-anon' } },
  });
  return anonSingleton;
}

/** URL del web a la que Supabase redirige tras los enlaces de correo. */
export function urlWeb(ruta: string): string {
  return `${env.WEB_ORIGIN.replace(/\/$/, '')}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}

/** Solo para pruebas. */
export function __setSupabaseAnonForTests(client: SupabaseClient | null): void {
  anonSingleton = client;
}
