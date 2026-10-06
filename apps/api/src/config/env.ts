import { z } from 'zod';

/**
 * Configuracion de entorno validada con Zod.
 *
 * Las credenciales de Supabase son OPCIONALES en el esquema para que la API
 * pueda arrancar (y /health responder `sin_credenciales`) sin claves. Todo lo
 * que las necesite debe pasar por `requireSupabaseEnv()`, que falla con un
 * mensaje claro.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const vacioAUndefined = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v);

function cargar(): Env {
  const crudo = {
    ...process.env,
    SUPABASE_URL: vacioAUndefined(process.env.SUPABASE_URL),
    SUPABASE_ANON_KEY: vacioAUndefined(process.env.SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: vacioAUndefined(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  const resultado = EnvSchema.safeParse(crudo);
  if (!resultado.success) {
    const detalle = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variables de entorno invalidas:\n${detalle}`);
  }
  return resultado.data;
}

export const env: Env = cargar();

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

/** `true` si estan las tres credenciales de Supabase. */
export function hasSupabaseCredentials(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Devuelve las credenciales o lanza un error con instrucciones claras. */
export function requireSupabaseEnv(): SupabaseEnv {
  const faltan: string[] = [];
  if (!env.SUPABASE_URL) faltan.push('SUPABASE_URL');
  if (!env.SUPABASE_ANON_KEY) faltan.push('SUPABASE_ANON_KEY');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) faltan.push('SUPABASE_SERVICE_ROLE_KEY');
  if (faltan.length > 0) {
    throw new Error(
      `Faltan credenciales de Supabase: ${faltan.join(', ')}. ` +
        'Copie apps/api/.env.example a apps/api/.env y complete los valores desde ' +
        'Supabase -> Project Settings -> API (proyecto kixjejmewgynzrppowfv).',
    );
  }
  return {
    url: env.SUPABASE_URL as string,
    anonKey: env.SUPABASE_ANON_KEY as string,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}
