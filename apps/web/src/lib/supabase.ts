import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente anon de Supabase para el navegador (solo Auth y lecturas sujetas a RLS).
 * Si faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY el cliente es `null` y la
 * UI muestra un aviso de configuracion en lugar de fallar al cargar.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigurado: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseConfigurado
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const MENSAJE_SIN_SUPABASE =
  'La aplicacion no tiene configuradas las credenciales de Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en apps/web/.env).';

/** Obtiene el cliente o lanza un error claro. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error(MENSAJE_SIN_SUPABASE);
  return supabase;
}
