import type { PayloadOutbox } from '../notificaciones.types';

/**
 * Motor de plantillas minimo (sin dependencias): `{{variable}}` con escape HTML
 * obligatorio, bloques `{{#if variable}}...{{/if}}` y `{{#unless variable}}...{{/unless}}`.
 * Verifica variables obligatorias y rechaza variables de actor (anonimato del evaluador).
 */

export class ErrorPlantilla extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorPlantilla';
  }
}

/** Claves prohibidas en cualquier contexto de renderizado (anonimato del evaluador / staff). */
export const RE_CLAVE_PROHIBIDA = /(evaluador|funcionario_nombre|funcionario_email|funcionario_correo|revisor|staff_email|correo_staff)/i;

export function escaparHtml(valor: unknown): string {
  const s = valor === null || valor === undefined ? '' : String(valor);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function esVerdadero(v: unknown): boolean {
  return !(v === undefined || v === null || v === false || v === '' || v === 0);
}

const RE_BLOQUE = /\{\{#(if|unless)\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\1\}\}/g;
const RE_VAR = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Renderiza bloques condicionales y variables (escapadas) sobre el texto dado. */
export function renderizarTexto(plantilla: string, contexto: PayloadOutbox, escapar: boolean): string {
  let salida = plantilla;
  // Bloques anidados simples: se resuelven en pasadas sucesivas.
  for (let i = 0; i < 5 && RE_BLOQUE.test(salida); i += 1) {
    RE_BLOQUE.lastIndex = 0;
    salida = salida.replace(RE_BLOQUE, (_m, tipo: string, clave: string, cuerpo: string) => {
      const v = esVerdadero(contexto[clave]);
      return (tipo === 'if' ? v : !v) ? cuerpo : '';
    });
  }
  RE_BLOQUE.lastIndex = 0;
  return salida.replace(RE_VAR, (_m, clave: string) => {
    const v = contexto[clave];
    const texto = v === null || v === undefined ? '' : String(v);
    return escapar ? escaparHtml(texto) : texto;
  });
}

/** Verifica que el contexto tenga las variables obligatorias (no vacias) y ninguna prohibida. */
export function verificarContexto(contexto: PayloadOutbox, obligatorias: readonly string[]): void {
  const prohibidas = Object.keys(contexto).filter((k) => RE_CLAVE_PROHIBIDA.test(k));
  if (prohibidas.length > 0) throw new ErrorPlantilla(`El contexto contiene variables de actor no permitidas: ${prohibidas.join(', ')}`);
  const faltantes = obligatorias.filter((k) => {
    const v = contexto[k];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (faltantes.length > 0) throw new ErrorPlantilla(`Faltan variables obligatorias de la plantilla: ${faltantes.join(', ')}`);
}

/** Texto plano a partir del HTML renderizado (parrafos y saltos preservados). */
export function htmlATexto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, texto: string) => `${texto.trim()} (${href})`)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .trim();
}
