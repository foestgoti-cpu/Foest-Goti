/**
 * Cache en memoria con TTL (prototipo; en produccion se sustituye por Redis con
 * la misma clave `usuario_id + filtros normalizados`). Sin dependencias.
 */
export class CacheMemoria<T> {
  private readonly entradas = new Map<string, { valor: T; expira: number }>();

  constructor(private readonly ttlMs: number, private readonly maxEntradas = 2000) {}

  obtener(clave: string): T | undefined {
    const e = this.entradas.get(clave);
    if (!e) return undefined;
    if (e.expira <= Date.now()) {
      this.entradas.delete(clave);
      return undefined;
    }
    return e.valor;
  }

  guardar(clave: string, valor: T): void {
    if (this.entradas.size >= this.maxEntradas) this.purgar();
    if (this.entradas.size >= this.maxEntradas) {
      // Sigue llena tras purgar vencidas: se descarta la mas antigua (orden de insercion).
      const primera = this.entradas.keys().next().value;
      if (primera !== undefined) this.entradas.delete(primera);
    }
    this.entradas.set(clave, { valor, expira: Date.now() + this.ttlMs });
  }

  limpiar(): void {
    this.entradas.clear();
  }

  get tamano(): number {
    return this.entradas.size;
  }

  private purgar(): void {
    const ahora = Date.now();
    for (const [k, e] of this.entradas) if (e.expira <= ahora) this.entradas.delete(k);
  }
}
