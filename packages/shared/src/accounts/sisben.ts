/**
 * Categorias del SISBEN IV (fuente unica; la usan el Select de la web y el esquema Zod).
 * Grupo A: A1-A5, B: B1-B7, C: C1-C18, D: D1-D21 (51 categorias).
 */
const rango = <G extends string>(grupo: G, n: number) => Array.from({ length: n }, (_, i) => `${grupo}${i + 1}`);

export const GRUPOS_SISBEN = [
  { grupo: 'A', etiqueta: 'Grupo A — Pobreza extrema', categorias: rango('A', 5) },
  { grupo: 'B', etiqueta: 'Grupo B — Pobreza moderada', categorias: rango('B', 7) },
  { grupo: 'C', etiqueta: 'Grupo C — Vulnerable', categorias: rango('C', 18) },
  { grupo: 'D', etiqueta: 'Grupo D — No pobre, no vulnerable', categorias: rango('D', 21) },
] as const;

export const CATEGORIAS_SISBEN = GRUPOS_SISBEN.flatMap((g) => g.categorias) as unknown as readonly [string, ...string[]];
