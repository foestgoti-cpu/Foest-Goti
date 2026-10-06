/**
 * Cache en memoria con TTL (admin_dashboard.md pide 60 s para resumen y alertas).
 * Para el prototipo (una instancia) basta con un Map; en produccion se reemplaza por Redis.
 */
interface Entrada<T> {
  valor: T;
  vence: number;
}

const almacen = new Map<string, Entrada<unknown>>();

export const TTL_DASHBOARD_MS = 60_000;

export async function conCache<T>(clave: string, ttlMs: number, calcular: () => Promise<T>): Promise<{ valor: T; desdeCache: boolean }> {
  const ahora = Date.now();
  const actual = almacen.get(clave) as Entrada<T> | undefined;
  if (actual && actual.vence > ahora) return { valor: actual.valor, desdeCache: true };
  const valor = await calcular();
  almacen.set(clave, { valor, vence: ahora + ttlMs });
  return { valor, desdeCache: false };
}

export function invalidarCache(prefijo?: string): void {
  if (!prefijo) {
    almacen.clear();
    return;
  }
  for (const k of [...almacen.keys()]) if (k.startsWith(prefijo)) almacen.delete(k);
}
