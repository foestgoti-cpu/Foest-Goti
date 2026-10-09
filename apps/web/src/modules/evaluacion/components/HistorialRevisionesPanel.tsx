import { Alert, Badge, Card, Spinner } from '../../../components/ui';
import { fechaCorta, fechaLarga } from '../../postulaciones/formato';
import { useHistorialRevisiones } from '../hooks/useEvaluacion';

/** Ciclos previos. Por anonimato solo se rotula "Revision del ciclo N" (nunca el evaluador). */
export function HistorialRevisionesPanel({ postulacionId }: { postulacionId: string }) {
  const { data, isLoading, error } = useHistorialRevisiones(postulacionId);

  return (
    <Card titulo="Historial de ciclos y observaciones previas">
      {isLoading && <Spinner />}
      {error && <Alert tipo="error">{(error as Error).message}</Alert>}
      {data && data.length === 0 && <p className="text-sm">No hay revisiones de ciclos anteriores.</p>}
      <ul className="space-y-3">
        {(data ?? []).map((r) => (
          <li key={r.ciclo} className="border border-ink rounded-lg p-3 text-sm">
            <p className="font-semibold">
              Revision del ciclo {r.ciclo} <Badge tono="destacado">{r.resultado}</Badge>
            </p>
            <p>Decidida: {fechaLarga(r.decidida_en)}</p>
            {r.observaciones && <p className="mt-1 whitespace-pre-wrap">{r.observaciones}</p>}
            {r.fecha_limite_subsanacion && <p>Plazo de subsanacion: {fechaCorta(r.fecha_limite_subsanacion)}</p>}
            {r.beneficios.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {r.beneficios.map((b) => (
                  <li key={b.codigo}>
                    {b.codigo}: {b.decision}
                    {b.monto_aprobado ? ` (monto ${b.monto_aprobado.toLocaleString('es-CO')})` : ''}
                    {b.motivo ? `. ${b.motivo}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {r.documentos.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer">Chequeo documental del ciclo</summary>
                <ul className="list-disc pl-5">
                  {r.documentos.map((c, i) => (
                    <li key={`${c.tipo_codigo}-${i}`}>
                      {c.tipo_codigo}: {c.resultado}
                      {c.observacion ? `. ${c.observacion}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
