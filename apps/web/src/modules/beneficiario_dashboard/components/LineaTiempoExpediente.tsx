import { Alert, Card, Spinner } from '../../../components/ui';
import type { LineaTiempo } from '../types';
import { AprobacionPorBeneficioList } from './AprobacionPorBeneficioList';

/**
 * Linea de tiempo vertical (mobile-first) con hitos en lenguaje claro y
 * observaciones firmadas "Equipo FOEST". Accesible: lista ordenada con
 * `aria-current` en el hito actual; no depende del color.
 */
export function LineaTiempoExpediente({ datos, cargando, error }: { datos?: LineaTiempo; cargando?: boolean; error?: Error | null }) {
  return (
    <Card titulo="Linea de tiempo de su expediente" id="expediente" data-testid="linea-tiempo">
      {cargando && <Spinner etiqueta="Cargando expediente" />}
      {error && <Alert tipo="error">{error.message}</Alert>}
      {!cargando && !error && !datos && <p className="text-base">Aun no tiene postulaciones. Su expediente aparecera aqui cuando inicie una.</p>}
      {datos && (
        <>
          <p className="mb-3 text-sm">
            <span className="font-semibold">Estado actual:</span> {datos.postulacion.estado_texto}
            {datos.postulacion.ciclo > 1 && ` (envio numero ${datos.postulacion.ciclo})`}
          </p>
          <ol className="relative ml-3 border-l-2 border-primary pl-5" aria-label="Hitos del expediente">
            {datos.hitos.map((h) => (
              <li key={h.id} className="relative pb-5 last:pb-0" aria-current={h.actual ? 'step' : undefined}>
                <span
                  aria-hidden="true"
                  className={`absolute -left-[27px] top-1 block h-4 w-4 rounded-full border-2 border-primary ${h.actual ? 'bg-primary' : 'bg-white'}`}
                />
                <p className="text-sm text-ink/80">
                  <time dateTime={h.fecha}>{h.fecha_texto}</time>
                  {h.ciclo > 1 && ` - envio ${h.ciclo}`}
                </p>
                <p className="text-base font-semibold">
                  {h.titulo}
                  {h.actual && <span className="ml-2 text-xs font-semibold uppercase tracking-wide">(actual)</span>}
                </p>
                <p className="text-sm">{h.descripcion}</p>
                {h.observacion && (
                  <blockquote className="mt-2 border border-ink rounded-lg bg-primary-10 px-3 py-2 text-sm">
                    {h.observacion.texto && <p>{h.observacion.texto}</p>}
                    {h.observacion.documentos_observados.length > 0 && (
                      <p className="mt-1">
                        <span className="font-semibold">Documentos observados:</span> {h.observacion.documentos_observados.join(', ')}
                      </p>
                    )}
                    {h.observacion.campos_observados.length > 0 && (
                      <p className="mt-1">
                        <span className="font-semibold">Campos observados:</span> {h.observacion.campos_observados.join(', ')}
                      </p>
                    )}
                    <footer className="mt-1 text-xs uppercase tracking-wide">Firma: {h.observacion.firma}</footer>
                  </blockquote>
                )}
              </li>
            ))}
          </ol>
          <AprobacionPorBeneficioList resultados={datos.resultado_por_beneficio} parcial={datos.postulacion.aprobacion_parcial} />
          {datos.pendiente_modulo.evaluacion && datos.postulacion.estado === 'APROBADA' && (
            <p className="mt-3 text-sm text-ink/80">El detalle por beneficio estara disponible cuando se habilite el modulo de evaluacion.</p>
          )}
        </>
      )}
    </Card>
  );
}
