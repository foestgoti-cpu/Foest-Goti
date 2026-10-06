import { Alert, Badge, Button, Card, Spinner } from '../../../components/ui';
import { fechaHora, numero } from '../formato';
import { useIntegridadAuditoria } from '../hooks/useAuditoria';

/**
 * Estado de la cadena de hashes (GET /auditoria/integridad): ultima verificacion,
 * eventos pendientes de verificar, cola de eventos fuera de transaccion e historial.
 */
export function IntegridadPanel() {
  const { data, isLoading, error, refetch, isFetching } = useIntegridadAuditoria();
  return (
    <Card
      titulo="Integridad de la cadena de hashes"
      className="mb-4"
      acciones={
        <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={() => void refetch()} disabled={isFetching}>
          Actualizar
        </Button>
      }
    >
      {isLoading && <Spinner />}
      {error && <Alert tipo="error">{(error as Error).message}</Alert>}
      {data && (
        <>
          {!data.ultima && <Alert tipo="advertencia">Aun no se ha ejecutado ninguna verificacion de integridad. El job diario corre a las 02:30 (hora de Colombia).</Alert>}
          {data.ultima && !data.ultima.valida && (
            <Alert tipo="error" titulo="Cadena rota">
              La verificacion del {fechaHora(data.ultima.verificada_en)} detecto una ruptura en la secuencia {data.ultima.primera_secuencia_rota ?? '?'}: {data.ultima.detalle ?? 'sin detalle'}. Los administradores fueron notificados.
            </Alert>
          )}
          {data.ultima && data.ultima.valida && (
            <Alert tipo="exito" titulo="Cadena integra">
              Ultima verificacion {fechaHora(data.ultima.verificada_en)}: {numero(data.ultima.total_verificados)} eventos verificados (secuencias {data.ultima.secuencia_desde ?? '—'} a {data.ultima.secuencia_hasta ?? '—'}).
            </Alert>
          )}
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-semibold">Secuencia actual</dt>
              <dd className="tabular-nums">{numero(data.secuencia_actual)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Pendientes de verificar</dt>
              <dd className="tabular-nums">{numero(data.pendientes_verificacion)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Cola fuera de transaccion</dt>
              <dd className="tabular-nums">{numero(data.cola.encolados)} encolados</dd>
            </div>
            <div>
              <dt className="font-semibold">Eventos de cola fallidos</dt>
              <dd className="tabular-nums">{numero(data.cola.fallidos)}</dd>
            </div>
          </dl>
          {data.historial.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-semibold">Historial de verificaciones ({data.historial.length})</summary>
              <ul className="mt-2 divide-y divide-ink/30 border border-ink">
                {data.historial.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {fechaHora(h.verificada_en)} · {h.origen} · secuencias {h.secuencia_desde ?? '—'} a {h.secuencia_hasta ?? '—'} ({numero(h.total_verificados)})
                    </span>
                    <Badge tono={h.valida ? 'neutro' : 'relleno'}>{h.origen === 'PURGA' ? 'Purga' : h.valida ? 'Valida' : 'Rota'}</Badge>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
