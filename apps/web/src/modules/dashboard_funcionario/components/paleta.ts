/**
 * Paleta estricta del panel (DECISIONES section 19): blanco, azul #0066ff y sus tintes, negro.
 * No hay segunda tonalidad: las series se distinguen por escalon de claridad (rampa
 * ordinal validada con la skill dataviz, validate_palette.js --ordinal: #0066ff -> #4488ff ->
 * #78acff, monotona, saltos >= 0.06 L, extremo claro 2.30:1 sobre blanco) y por TEXTURA
 * (tramado a 45 grados / 135 grados) como canal secundario; nunca por color solo.
 * Los textos siempre en negro (tokens de texto), nunca con el color de la serie.
 */
export const AZUL = '#0066ff';
export const RAMPA = ['#0066ff', '#4488ff', '#78acff'] as const;
export const SUPERFICIE = '#ffffff';
export const TINTA = '#000000';
export const TINTA_SECUNDARIA = 'rgba(0, 0, 0, 0.72)';
export const REJILLA = 'rgba(0, 0, 0, 0.12)';
export const EJE = 'rgba(0, 0, 0, 0.35)';
/** Relleno de area: tinte al 10 % del azul. */
export const AREA_10 = 'rgba(0, 102, 255, 0.10)';

export const ID_TRAMA_45 = 'dfn-trama-45';
export const ID_TRAMA_135 = 'dfn-trama-135';

/**
 * Secuencia de rellenos para hasta 6 segmentos: tres escalones solidos y, a partir del
 * cuarto, los mismos escalones con trama a 45 grados (identidad por textura + claridad).
 */
export interface Relleno {
  fill: string;
  /** Color base del escalon (para la leyenda y la tabla). */
  color: string;
  tramado: boolean;
}

export function rellenoSerie(indice: number): Relleno {
  const color = RAMPA[indice % RAMPA.length] as string;
  const tramado = indice >= RAMPA.length;
  return { color, tramado, fill: tramado ? `url(#${ID_TRAMA_45}-${indice % RAMPA.length})` : color };
}

export const FUENTE_EJE = { fontSize: 12, fill: TINTA_SECUNDARIA } as const;
