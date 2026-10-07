import type { MiDesembolsoDto, MiOtorgamientoDto } from '@foest/shared';
import { Alert, Card, EmptyState, PageHeader, Spinner, Table } from '../../../components/ui';
import { EstadoDesembolsoBadge, EstadoOtorgamientoBadge } from '../components/EstadoBadges';
import { useMisOtorgamientos } from '../hooks/useSeguimiento';
import { formatearFechaLocal, formatearMoneda, mensajeDeError, nombreBeneficio } from '../utils';

const TEXTO_ESTADO: Record<MiOtorgamientoDto['estado'], string> = {
  ACTIVO: 'Su beneficio esta vigente.',
  SUSPENDIDO: 'Su beneficio esta suspendido temporalmente. Los pagos programados se retomaran cuando se reactive.',
  REVOCADO: 'Su beneficio fue revocado. Si tiene dudas, comuniquese con el Equipo FOEST.',
  CUMPLIDO: 'Su beneficio se cumplio satisfactoriamente.',
};

/** `/beneficiario/beneficios`: otorgamientos y desembolsos propios, sin datos de cuenta completos. */
export function MisBeneficiosPage() {
  const { data, isLoading, error } = useMisOtorgamientos();
  const lista = data ?? [];

  return (
    <>
      <PageHeader titulo="Mis beneficios" descripcion="Beneficios que le fueron otorgados y el estado de sus pagos." />
      {error && <Alert tipo="error" className="mb-4">{mensajeDeError(error)}</Alert>}
      {isLoading && <Spinner />}
      {!isLoading && !error && lista.length === 0 && (
        <EmptyState titulo="Aun no tiene beneficios otorgados" descripcion="Cuando una postulacion sea aprobada, su beneficio aparecera aqui." />
      )}
      <div className="space-y-6">
        {lista.map((o) => (
          <Card key={o.id} titulo={`${nombreBeneficio(o.beneficio_codigo, o.beneficio_nombre)} - ${o.convocatoria_nombre ?? ''}`} acciones={<EstadoOtorgamientoBadge estado={o.estado} />}>
            <p className="mb-3">{TEXTO_ESTADO[o.estado]}</p>
            <dl className="mb-4 grid grid-cols-2 gap-y-1 text-sm sm:max-w-md">
              <dt className="font-semibold">Monto aprobado</dt><dd>{formatearMoneda(o.monto_aprobado)}</dd>
              <dt className="font-semibold">Ya recibido</dt><dd>{formatearMoneda(o.monto_desembolsado)}</dd>
              <dt className="font-semibold">Otorgado el</dt><dd>{formatearFechaLocal(o.otorgado_en)}</dd>
              {o.cuenta_pago && (
                <>
                  <dt className="font-semibold">Cuenta de pago</dt>
                  <dd>{o.cuenta_pago.entidad ? `${o.cuenta_pago.entidad} ` : ''}{o.cuenta_pago.numero_enmascarado}</dd>
                </>
              )}
            </dl>
            <Table<MiDesembolsoDto>
              caption="Pagos del beneficio"
              columnas={[
                { clave: 'estado', titulo: 'Estado', render: (d) => <EstadoDesembolsoBadge estado={d.estado} /> },
                { clave: 'monto', titulo: 'Monto', alineacion: 'derecha', render: (d) => formatearMoneda(d.monto) },
                { clave: 'concepto', titulo: 'Concepto', render: (d) => d.concepto ?? '-' },
                { clave: 'fecha', titulo: 'Fecha', render: (d) => formatearFechaLocal(d.fecha_pago ?? d.fecha_programada) },
                { clave: 'ref', titulo: 'Referencia', render: (d) => d.referencia_pago ?? '-' },
              ]}
              filas={o.desembolsos}
              obtenerId={(d) => d.id}
              vacio={{ titulo: 'Sin pagos programados', descripcion: 'Le informaremos cuando se programe un pago.' }}
            />
          </Card>
        ))}
      </div>
    </>
  );
}
