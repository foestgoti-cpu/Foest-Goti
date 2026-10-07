import crypto from 'node:crypto';
import type { TipoFormato } from '@foest/shared';

/**
 * Serializacion canonica (claves ordenadas, sin valores undefined, sin marcas de tiempo
 * de generacion) y SHA-256 del contenido que se imprime en cada formato.
 */
export class HashContenidoService {
  /** hash_contenido canonico: SHA-256 hexadecimal de la serializacion de los datos usados. */
  calcularHash(tipo: TipoFormato, datos: unknown): string {
    const canonica = this.serializar({ tipo, datos });
    return crypto.createHash('sha256').update(canonica, 'utf8').digest('hex');
  }

  serializar(valor: unknown): string {
    if (valor === null || valor === undefined) return 'null';
    if (valor instanceof Date) return JSON.stringify(valor.toISOString());
    if (typeof valor === 'string') return JSON.stringify(valor);
    if (typeof valor === 'number' || typeof valor === 'boolean') return JSON.stringify(valor);
    if (Array.isArray(valor)) return `[${valor.map((item) => this.serializar(item)).join(',')}]`;
    if (typeof valor === 'object') {
      const objeto = valor as Record<string, unknown>;
      const claves = Object.keys(objeto)
        .filter((k) => objeto[k] !== undefined)
        .sort();
      return `{${claves.map((k) => `${JSON.stringify(k)}:${this.serializar(objeto[k])}`).join(',')}}`;
    }
    return JSON.stringify(String(valor));
  }
}

export const hashContenidoService = new HashContenidoService();

/** SHA-256 hexadecimal de un buffer (archivo final). */
export function sha256Hex(contenido: Buffer): string {
  return crypto.createHash('sha256').update(contenido).digest('hex');
}
