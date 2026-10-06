import type { ItemDistribucion } from '../types';
import { formatoEntero } from './TooltipGrafico';

/** Vista de tabla (gemela accesible) de una distribucion; incluye porcentaje sobre el total publicado. */
export function TablaDistribucion({ items, caption, etiquetaClave }: { items: ItemDistribucion[]; caption: string; etiquetaClave: string }) {
  const total = items.reduce((acc, i) => acc + i.total, 0);
  return (
    <div className="overflow-x-auto border border-ink">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-primary-10">
          <tr>
            <th scope="col" className="border-b border-ink px-3 py-2 font-semibold">
              {etiquetaClave}
            </th>
            <th scope="col" className="border-b border-ink px-3 py-2 text-right font-semibold">
              Postulaciones
            </th>
            <th scope="col" className="border-b border-ink px-3 py-2 text-right font-semibold">
              Participacion
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.clave} className="border-b border-ink/30 last:border-b-0">
              <td className="px-3 py-1.5">{i.etiqueta}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatoEntero.format(i.total)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{total > 0 ? `${((i.total / total) * 100).toFixed(1).replace('.', ',')} %` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
