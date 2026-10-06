import { logger, supabaseAdmin } from '../../shared';

/**
 * Lectura con cache corto de `configuracion_sistema` (claves INT del modulo):
 * NOTIF_REINTENTOS_MAX, RECORDATORIO_BORRADOR_DIAS, RECORDATORIO_SUBSANACION_DIAS_HABILES,
 * RETENCION_NOTIFICACIONES_MESES. Si la lectura falla se usa el valor por defecto.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { valor: number; expira: number }>();

export async function leerConfigInt(clave: string, defecto: number): Promise<number> {
  const ahora = Date.now();
  const c = cache.get(clave);
  if (c && c.expira > ahora) return c.valor;
  try {
    const { data, error } = await supabaseAdmin.from('configuracion_sistema').select('valor').eq('clave', clave).maybeSingle();
    if (error) throw error;
    const crudo = (data as { valor: string | number | null } | null)?.valor;
    const n = crudo === null || crudo === undefined ? NaN : Number(crudo);
    const valor = Number.isFinite(n) ? n : defecto;
    cache.set(clave, { valor, expira: ahora + TTL_MS });
    return valor;
  } catch (e) {
    logger.warn({ err: e, clave }, 'No fue posible leer la configuracion; se usa el valor por defecto');
    return defecto;
  }
}

export function __limpiarCacheConfig(): void {
  cache.clear();
}
