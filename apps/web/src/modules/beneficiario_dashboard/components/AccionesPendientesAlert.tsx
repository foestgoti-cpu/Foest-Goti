import { Link } from 'react-router-dom';
import { Badge, Card } from '../../../components/ui';
import type { AccionPendiente, PrioridadAccion } from '../types';

const TEXTO_PRIORIDAD: Record<PrioridadAccion, string> = { ALTA: 'Urgente', MEDIA: 'Pronto', BAJA: 'Informativo' };

/** Lista priorizada de acciones pendientes (calculadas por la API). */
export function AccionesPendientesAlert({ acciones }: { acciones: AccionPendiente[] }) {
  return (
    <Card titulo="Acciones pendientes" data-testid="acciones-pendientes">
      {acciones.length === 0 ? (
        <p className="text-base">No tiene acciones pendientes en este momento.</p>
      ) : (
        <ol className="divide-y divide-ink/30" aria-label="Acciones pendientes ordenadas por prioridad">
          {acciones.map((a, i) => {
            const urgente = a.prioridad === 'ALTA';
            const esAncla = a.accion_url.includes('#');
            const clasesBoton =
              'inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border px-4 text-base no-underline hover:no-underline sm:w-auto ' +
              (urgente ? 'border-primary bg-primary text-white hover:bg-primary/90' : 'border-ink bg-white text-ink hover:bg-primary-10');
            return (
              <li key={`${a.tipo}-${a.postulacion_id ?? 'x'}-${i}`} className={`py-3 ${urgente ? 'border-l-4 border-l-primary pl-3' : ''}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">{a.titulo}</span>
                      <Badge tono={urgente ? 'relleno' : a.prioridad === 'MEDIA' ? 'destacado' : 'neutro'} aria-label={`Prioridad: ${TEXTO_PRIORIDAD[a.prioridad]}`}>
                        {TEXTO_PRIORIDAD[a.prioridad]}
                      </Badge>
                    </p>
                    <p className="mt-1 text-sm">{a.descripcion}</p>
                    {a.fecha_limite_texto && (
                      <p className="mt-1 text-sm">
                        <span className="font-semibold">Fecha limite:</span> {a.fecha_limite_texto}
                      </p>
                    )}
                  </div>
                  {esAncla ? (
                    <a href={a.accion_url} className={clasesBoton}>
                      {a.etiqueta_accion}
                    </a>
                  ) : (
                    <Link to={a.accion_url} className={clasesBoton}>
                      {a.etiqueta_accion}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
