import { ID_TRAMA_135, ID_TRAMA_45, RAMPA, SUPERFICIE } from './paleta';

/**
 * Definiciones SVG de tramas (45 grados y su espejo 135 grados) por escalon de la rampa.
 * Se insertan dentro del <svg> de cada grafico (Recharts acepta <defs> como hijo).
 * Tono sobre tono: trazo del color del escalon sobre un fondo del mismo color al 10 %.
 */
export function Tramas() {
  return (
    <defs>
      {RAMPA.map((color, i) => (
        <pattern key={`t45-${i}`} id={`${ID_TRAMA_45}-${i}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" fill={SUPERFICIE} />
          <rect width="8" height="8" fill={color} fillOpacity={0.12} />
          <line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth="2.5" />
        </pattern>
      ))}
      {RAMPA.map((color, i) => (
        <pattern key={`t135-${i}`} id={`${ID_TRAMA_135}-${i}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(135)">
          <rect width="8" height="8" fill={SUPERFICIE} />
          <rect width="8" height="8" fill={color} fillOpacity={0.12} />
          <line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth="2.5" />
        </pattern>
      ))}
    </defs>
  );
}

/** Muestra de leyenda (rect para barras/areas) con el mismo relleno que la marca. */
export function MuestraLeyenda({ fill, tramado, color }: { fill: string; tramado: boolean; color: string }) {
  return (
    <svg width="14" height="14" aria-hidden="true" className="shrink-0">
      {tramado && (
        <defs>
          <pattern id={`leg-${fill.replace(/[^a-z0-9]/gi, '')}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={SUPERFICIE} />
            <rect width="6" height="6" fill={color} fillOpacity={0.12} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2" />
          </pattern>
        </defs>
      )}
      <rect width="14" height="14" rx="2" fill={tramado ? `url(#leg-${fill.replace(/[^a-z0-9]/gi, '')})` : fill} stroke={color} strokeWidth="1" />
    </svg>
  );
}
