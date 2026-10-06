import type { CeldaConteo } from './dashboard_funcionario.types';

export const ETIQUETA_OTROS = 'Otros / Casos aislados';

export interface ResultadoKAnonimato {
  /** Celdas visibles (>= umbral) mas, al final, el bucket "Otros / Casos aislados" si aplica. */
  items: Array<CeldaConteo & { agrupado: boolean }>;
  /** true si el total completo es menor al umbral: no se publica desglose alguno. */
  suprimido: boolean;
  /** Cuantas celdas originales terminaron dentro de "Otros". */
  celdas_agrupadas: number;
}

/**
 * K-anonimato con supresion complementaria (DECISIONES section 15, dashboard_funcionario.md).
 *
 * 1. Toda celda con conteo menor al umbral se agrupa en "Otros / Casos aislados".
 * 2. Como el total del alcance se publica en `resumen`, el valor de "Otros" siempre es
 *    deducible por resta; por eso el bucket debe ser, a su vez, no identificable:
 *    - si "Otros" queda con una sola celda, su valor identificaria esa celda;
 *    - si "Otros" queda por debajo del umbral, describe a menos de k personas.
 *    En ambos casos se incorpora al bucket la menor celda visible siguiente y se repite
 *    hasta que "Otros" tenga >= umbral y >= 2 celdas, o no quede ninguna celda visible.
 * 3. Si el total completo es menor al umbral se responde `suprimido: true` sin desglose.
 */
export function aplicarKAnonimato(celdas: CeldaConteo[], umbral: number): ResultadoKAnonimato {
  const k = Math.max(2, Math.floor(umbral));
  const limpias = celdas
    .filter((c) => Number.isFinite(c.total) && c.total > 0)
    .map((c) => ({ clave: c.clave, total: Math.floor(c.total) }));
  const total = limpias.reduce((acc, c) => acc + c.total, 0);

  if (total === 0) return { items: [], suprimido: false, celdas_agrupadas: 0 };
  if (total < k) return { items: [], suprimido: true, celdas_agrupadas: limpias.length };

  // Orden descendente estable por total y luego por clave
  const ordenadas = [...limpias].sort((a, b) => b.total - a.total || a.clave.localeCompare(b.clave));
  const visibles = ordenadas.filter((c) => c.total >= k);
  const pequenas = ordenadas.filter((c) => c.total < k);

  if (pequenas.length === 0) {
    return { items: visibles.map((c) => ({ ...c, agrupado: false })), suprimido: false, celdas_agrupadas: 0 };
  }

  let otros = pequenas.reduce((acc, c) => acc + c.total, 0);
  let agrupadas = pequenas.length;

  // Supresion complementaria: "Otros" debe tener >= k casos y >= 2 celdas.
  while ((otros < k || agrupadas < 2) && visibles.length > 0) {
    const menor = visibles.pop() as CeldaConteo; // la menor celda visible (lista ordenada desc)
    otros += menor.total;
    agrupadas += 1;
  }

  if (otros < k) {
    // Solo ocurre si total < k (ya cubierto), se deja por robustez.
    return { items: [], suprimido: true, celdas_agrupadas: agrupadas };
  }

  return {
    items: [...visibles.map((c) => ({ ...c, agrupado: false })), { clave: ETIQUETA_OTROS, total: otros, agrupado: true }],
    suprimido: false,
    celdas_agrupadas: agrupadas,
  };
}
