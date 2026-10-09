import { Badge } from '../../../components/ui';
import type { ResultadoBeneficio } from '../types';

const formatoCop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Resultado por beneficio (aprobacion parcial o total). */
export function AprobacionPorBeneficioList({ resultados, parcial }: { resultados: ResultadoBeneficio[]; parcial: boolean }) {
  if (resultados.length === 0) return null;
  return (
    <section aria-labelledby="resultado-beneficio-titulo" className="mt-4 border border-ink rounded-xl overflow-hidden">
      <div className="border-b border-ink bg-primary-10 px-3 py-2">
        <h3 id="resultado-beneficio-titulo" className="text-base font-semibold">
          Resultado por beneficio{parcial ? ' (aprobacion parcial)' : ''}
        </h3>
      </div>
      <ul className="divide-y divide-ink/30">
        {resultados.map((r) => (
          <li key={r.beneficio_codigo} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold">{r.beneficio_nombre}</p>
              {r.monto_aprobado !== null && <p className="text-sm">Monto aprobado: {formatoCop.format(r.monto_aprobado)}</p>}
              {r.motivo_publico && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Motivo (Equipo FOEST):</span> {r.motivo_publico}
                </p>
              )}
            </div>
            <Badge tono={r.decision === 'APROBADO' ? 'relleno' : 'neutro'} aria-label={`Decision: ${r.decision_texto}`}>
              {r.decision_texto}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
