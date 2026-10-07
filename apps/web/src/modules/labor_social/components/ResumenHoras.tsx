import { horas } from '../formato';

/** Acumulado de horas frente al mínimo exigido (barra accesible con texto alternativo). */
export function ResumenHoras({ total, minimas }: { total: number; minimas: number }) {
  const meta = minimas > 0 ? minimas : null;
  const porcentaje = meta ? Math.min(100, Math.round((total / meta) * 100)) : total > 0 ? 100 : 0;
  const cumple = meta ? total >= meta : total > 0;
  const faltan = meta ? Math.max(0, meta - total) : 0;

  return (
    <div>
      <p className="text-base">
        <span className="font-semibold">{horas(total)}</span>{' '}
        {meta ? (
          <>
            de <span className="font-semibold">{horas(meta)}</span> horas mínimas
          </>
        ) : (
          'horas acumuladas (mínimo aún no definido)'
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Horas de labor social acumuladas frente al mínimo exigido"
        aria-valuemin={0}
        aria-valuemax={meta ?? Math.max(total, 1)}
        aria-valuenow={total}
        aria-valuetext={meta ? `${horas(total)} de ${horas(meta)} horas` : `${horas(total)} horas`}
        className="mt-2 h-4 w-full border border-ink bg-white"
      >
        <div className="h-full bg-primary" style={{ width: `${porcentaje}%` }} />
      </div>
      <p className="mt-1 text-sm">{cumple ? 'Cumple con el mínimo de horas exigido.' : `Le faltan ${horas(faltan)} horas para el mínimo exigido.`}</p>
    </div>
  );
}
