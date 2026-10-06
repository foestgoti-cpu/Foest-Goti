import { Alert, Badge, Card, Spinner } from '../../../components/ui';
import type { Otorgamientos } from '../types';

const formatoCop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Otorgamientos y desembolsos propios; datos de pago solo enmascarados. */
export function OtorgamientosCard({ datos, cargando, error }: { datos?: Otorgamientos; cargando?: boolean; error?: Error | null }) {
  return (
    <Card titulo="Otorgamientos y desembolsos" id="otorgamientos" data-testid="otorgamientos">
      {cargando && <Spinner etiqueta="Cargando otorgamientos" />}
      {error && <Alert tipo="error">{error.message}</Alert>}
      {datos && datos.pendiente_modulo.seguimiento && <p className="text-base">El seguimiento de beneficios se habilitara proximamente.</p>}
      {datos && !datos.pendiente_modulo.seguimiento && datos.otorgamientos.length === 0 && (
        <p className="text-base">Aun no tiene otorgamientos registrados. Apareceran aqui cuando una postulacion sea aprobada.</p>
      )}
      {datos && datos.otorgamientos.length > 0 && (
        <ul className="space-y-3" aria-label="Otorgamientos">
          {datos.otorgamientos.map((o) => (
            <li key={o.id} className="border border-ink">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink bg-primary-10 px-3 py-2">
                <p className="font-semibold">{o.beneficio_nombre}</p>
                <Badge tono={o.estado === 'ACTIVO' || o.estado === 'CUMPLIDO' ? 'relleno' : 'destacado'} aria-label={`Estado del otorgamiento: ${o.estado_texto}`}>
                  {o.estado_texto}
                </Badge>
              </div>
              <div className="px-3 py-3 text-sm">
                {o.monto_aprobado !== null && (
                  <p>
                    <span className="font-semibold">Monto aprobado:</span> {formatoCop.format(o.monto_aprobado)}
                  </p>
                )}
                {o.cuenta_pago && (
                  <p>
                    <span className="font-semibold">Cuenta de pago:</span> {o.cuenta_pago.tipo === 'BILLETERA' ? 'Billetera' : 'Cuenta bancaria'}
                    {o.cuenta_pago.entidad ? ` ${o.cuenta_pago.entidad}` : ''} terminada en {o.cuenta_pago.ultimos4}
                  </p>
                )}
                {o.motivo_publico && (
                  <p className="mt-1">
                    <span className="font-semibold">Motivo (Equipo FOEST):</span> {o.motivo_publico}
                  </p>
                )}
                {o.desembolsos.length > 0 ? (
                  <table className="mt-3 w-full border-collapse border border-ink text-sm">
                    <caption className="sr-only">Desembolsos del otorgamiento {o.beneficio_nombre}</caption>
                    <thead className="bg-primary-10">
                      <tr>
                        <th scope="col" className="border border-ink px-2 py-1 text-left">
                          Fecha
                        </th>
                        <th scope="col" className="border border-ink px-2 py-1 text-left">
                          Estado
                        </th>
                        <th scope="col" className="border border-ink px-2 py-1 text-right">
                          Monto
                        </th>
                        <th scope="col" className="border border-ink px-2 py-1 text-left">
                          Referencia
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.desembolsos.map((d) => (
                        <tr key={d.id}>
                          <td className="border border-ink px-2 py-1">{d.fecha_texto ?? 'Por definir'}</td>
                          <td className="border border-ink px-2 py-1">{d.estado_texto}</td>
                          <td className="border border-ink px-2 py-1 text-right">{d.monto !== null ? formatoCop.format(d.monto) : '-'}</td>
                          <td className="border border-ink px-2 py-1">{d.referencia_pago ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-2 text-ink/80">Sin desembolsos registrados todavia.</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
