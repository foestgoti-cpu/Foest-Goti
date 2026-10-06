import { Card } from '../../../components/ui';
import type { RespuestaTiempos } from '../types';
import { formatoDecimal, formatoEntero } from './TooltipGrafico';

/** Horas naturales a texto legible: "36,5 h" y, si supera 48 h, el equivalente en dias. */
export function formatearHoras(horas: number): string {
  const base = `${formatoDecimal.format(horas)} h`;
  if (horas >= 48) return `${base} (${formatoDecimal.format(horas / 24)} dias)`;
  return base;
}

export interface MetricasTiemposRevisionProps {
  datos: RespuestaTiempos | undefined;
  cargando?: boolean;
  atenuado?: boolean;
}

/**
 * Indicador de tiempos de revision: dos fichas (promedio y percentil 90) en horas naturales
 * entre el envio del ciclo y su dictamen. Con `sin_datos` o muestra insuficiente se explica
 * en texto en lugar de mostrar un cero enganoso.
 */
export function MetricasTiemposRevision({ datos, cargando, atenuado }: MetricasTiemposRevisionProps) {
  const publicable = Boolean(datos && !datos.sin_datos && !datos.suprimido);
  return (
    <Card titulo="Tiempos de revision" className={`transition-opacity ${atenuado ? 'opacity-60' : ''}`}>
      <p className="mb-3 text-sm text-ink/80">
        Horas naturales entre el envio de un ciclo y su dictamen (mismo ciclo). Calculado sobre los dictamenes del alcance y periodo seleccionados.
      </p>
      {cargando && !datos && <p className="text-sm">Cargando tiempos...</p>}
      {datos?.sin_datos && (
        <p className="border-l-2 border-ink pl-2 text-sm" role="status" data-testid="tiempos-sin-datos">
          Sin dictamenes todavia en el alcance y periodo seleccionados. El indicador aparecera con el primer dictamen emitido.
        </p>
      )}
      {datos?.suprimido && (
        <p className="border-l-2 border-ink pl-2 text-sm" role="status">
          Hay {formatoEntero.format(datos.n)} {datos.n === 1 ? 'dictamen' : 'dictamenes'}, menos que el umbral de privacidad ({datos.umbral}); el promedio y el percentil 90 se publican al alcanzarlo.
        </p>
      )}
      {publicable && datos && (
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="border border-ink px-4 py-3">
            <dt className="text-sm font-semibold">Promedio</dt>
            <dd className="mt-1 text-3xl font-semibold leading-none" data-testid="tiempos-promedio">
              {datos.promedio_horas !== null ? formatearHoras(datos.promedio_horas) : '-'}
            </dd>
          </div>
          <div className="border border-ink px-4 py-3">
            <dt className="text-sm font-semibold">Percentil 90</dt>
            <dd className="mt-1 text-3xl font-semibold leading-none" data-testid="tiempos-p90">
              {datos.p90_horas !== null ? formatearHoras(datos.p90_horas) : '-'}
            </dd>
            <dd className="mt-2 text-xs text-ink/70">El 90 % de los dictamenes se emitio en este tiempo o menos.</dd>
          </div>
          <div className="sm:col-span-2 text-xs text-ink/70">
            Muestra: {formatoEntero.format(datos.n)} {datos.n === 1 ? 'dictamen' : 'dictamenes'}.
          </div>
        </dl>
      )}
    </Card>
  );
}
