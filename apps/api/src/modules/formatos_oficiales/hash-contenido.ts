import crypto from 'node:crypto';
import { TipoFormato } from '@foest/shared';

export class HashContenidoService {
  /**
   * Genera el hash_contenido canónico.
   */
  calcularHash(tipo: TipoFormato, datos: any): string {
    const canonicalStr = this.serializeCanonical(datos);
    return crypto.createHash('sha256').update(canonicalStr).digest('hex');
  }

  private serializeCanonical(obj: any): string {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj !== 'object') return String(obj);
    if (Array.isArray(obj)) {
      const arrStr = obj.map(item => this.serializeCanonical(item)).join(',');
      return `[${arrStr}]`;
    }

    const keys = Object.keys(obj).sort();
    const props = keys.map(k => `${k}:${this.serializeCanonical(obj[k])}`).join('|');
    return `{${props}}`;
  }
}

export const hashContenidoService = new HashContenidoService();

