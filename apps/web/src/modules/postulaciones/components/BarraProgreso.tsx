import { TITULOS_SECCION, type SeccionFormulario } from '@foest/shared';
import { cn } from '../../../lib/cn';

/**
 * Barra de progreso del asistente: una casilla por seccion aplicable.
 * Completa = borde y relleno primario; actual = borde doble; pendiente = blanco.
 */
type Paso = SeccionFormulario | 'documentos';
const tituloPaso = (s: Paso): string => (s === 'documentos' ? 'Documentos de soporte' : TITULOS_SECCION[s]);

export function BarraProgreso({
  secciones,
  completas,
  actual,
  onIr,
}: {
  secciones: Paso[];
  completas: Paso[];
  actual: Paso;
  onIr?: (s: Paso) => void;
}) {
  const total = secciones.length;
  const hechas = secciones.filter((s) => completas.includes(s)).length;
  const porcentaje = total === 0 ? 0 : Math.round((hechas / total) * 100);
  return (
    <div className="mb-6" aria-label="Progreso del formulario">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>
          Progreso: {hechas} de {total} secciones completas
        </span>
        <span aria-hidden="true">{porcentaje}%</span>
      </div>
      <div className="h-2 w-full border border-ink bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje}>
        <div className="h-full bg-primary" style={{ width: `${porcentaje}%` }} />
      </div>
      <ol className="mt-3 flex flex-wrap gap-1">
        {secciones.map((s, i) => {
          const completa = completas.includes(s);
          const esActual = s === actual;
          return (
            <li key={s}>
              <button
                type="button"
                onClick={onIr ? () => onIr(s) : undefined}
                aria-current={esActual ? 'step' : undefined}
                className={cn(
                  'min-h-[44px] border px-2 py-1 text-xs sm:text-sm',
                  completa ? 'border-primary bg-primary-20' : 'border-ink bg-white',
                  esActual && 'border-2 border-primary font-semibold',
                )}
                title={tituloPaso(s)}
              >
                {i + 1}. {tituloPaso(s)}
                {completa && <span className="sr-only"> (completa)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
