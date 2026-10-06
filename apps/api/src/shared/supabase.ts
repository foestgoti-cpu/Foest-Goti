import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseEnv } from '../config/env';

/**
 * Dos clientes (DECISIONES section 19):
 *
 * - `supabaseAdmin`: service role. Omite RLS. Solo para operaciones de sistema
 *   (auditoria, cambios de rol, validacion de tokens, jobs). NUNCA se construye
 *   con datos del usuario.
 * - `supabaseAsUser(accessToken)`: cliente anon con el JWT del usuario en el
 *   header Authorization, de modo que las politicas RLS apliquen como segunda
 *   barrera. Usarlo para lecturas/escrituras en nombre del usuario.
 *
 * Ambos se crean de forma perezosa para que la API arranque sin credenciales.
 */

let adminSingleton: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminSingleton) return adminSingleton;
  const { url, serviceRoleKey } = requireSupabaseEnv();
  adminSingleton = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'foest-api/admin' } },
  });
  return adminSingleton;
}

/**
 * Proxy perezoso: permite `import { supabaseAdmin } from '../shared/supabase'`
 * y usarlo como un SupabaseClient normal; la creacion real (y el error claro
 * si faltan claves) ocurre en el primer acceso a una propiedad.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const real = getSupabaseAdmin();
    const valor = Reflect.get(real, prop, receiver);
    return typeof valor === 'function' ? valor.bind(real) : valor;
  },
});

export function supabaseAsUser(accessToken: string): SupabaseClient {
  if (!accessToken) throw new Error('supabaseAsUser requiere un access token');
  const { url, anonKey } = requireSupabaseEnv();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Client-Info': 'foest-api/user',
      },
    },
  });
}

/** Solo para pruebas: permite inyectar un cliente simulado. */
export function __setSupabaseAdminForTests(client: SupabaseClient | null): void {
  adminSingleton = client;
}
