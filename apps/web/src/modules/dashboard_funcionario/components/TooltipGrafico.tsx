/**
 * Tooltip institucional para Recharts: el valor manda (negrita), la serie acompana.
 * Nombres y valores se insertan como texto (nunca HTML).
 */
export interface FilaTooltip {
  nombre: string;
  valor: string;
  color?: string;
}

export function TooltipGrafico({ titulo, filas }: { titulo?: string; filas: FilaTooltip[] }) {
  if (filas.length === 0) return null;
  return (
    <div className="rounded-lg border border-ink bg-white px-3 py-2 text-sm text-ink shadow-none" role="status">
      {titulo && <p className="mb-1 font-semibold">{titulo}</p>}
      <ul className="space-y-0.5">
        {filas.map((f) => (
          <li key={f.nombre} className="flex items-center gap-2">
            {f.color && <span aria-hidden="true" className="inline-block h-0.5 w-3 shrink-0" style={{ backgroundColor: f.color }} />}
            <span className="font-semibold tabular-nums">{f.valor}</span>
            <span className="text-ink/70">{f.nombre}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const formatoEntero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
export const formatoDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
