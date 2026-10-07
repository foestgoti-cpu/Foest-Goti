import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { DesembolsoDto, EventoOtorgamientoDto } from '@foest/shared';
import { Alert, Button, Card, PageHeader, Spinner, Table } from '../../../components/ui';
import { usePermissions } from '../../roles_permissions';
import { CambioEstadoModal } from '../components/CambioEstadoModal';
import { AnularDesembolsoModal, PagarDesembolsoModal, ProgramarDesembolsoModal } from '../components/DesembolsoModales';
import { EstadoDesembolsoBadge, EstadoOtorgamientoBadge } from '../components/EstadoBadges';
import { useMutacionesOtorgamiento, useOtorgamiento } from '../hooks/useSeguimiento';
import type { AccionEstado } from '../types';
import { ETIQUETA_EVENTO, formatearFechaHora, formatearFechaLocal, formatearMoneda, mensajeDeError, nombreBeneficio } from '../utils';

type Dialogo = { tipo: 'estado'; accion: AccionEstado } | { tipo: 'programar' } | { tipo: 'pagar'; d: DesembolsoDto } | { tipo: 'anular'; d: DesembolsoDto } | null;

/** `/admin/seguimiento/:id`: detalle, linea de tiempo, desembolsos y acciones. */
export function OtorgamientoDetallePage() {
  const { id = '' } = useParams();
  const { can } = usePermissions();
  const { data: o, isLoading, error } = useOtorgamiento(id);
  const m = useMutacionesOtorgamiento(id);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [exito, setExito] = useState<string | null>(null);

  if (isLoading) return <Spinner />;
  if (error || !o) return <Alert tipo="error">{mensajeDeError(error ?? new Error('Otorgamiento no encontrado'))}</Alert>;

  const cerrar = () => {
    setDialogo(null);
    m.cambiarEstado.reset();
    m.programar.reset();
    m.pagar.reset();
    m.anular.reset();
  };
  const ok = (msg: string) => {
    cerrar();
    setExito(msg);
  };
  const activo = o.estado === 'ACTIVO';
  const suspendido = o.estado === 'SUSPENDIDO';
  const puedeDesembolsar = can('seguimiento:desembolsar');

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Seguimiento de beneficios', ruta: '/admin/seguimiento' }, { etiqueta: o.beneficiario_nombre ?? 'Otorgamiento' }]}
        titulo={`${nombreBeneficio(o.beneficio_codigo, o.beneficio_nombre)} - ${o.beneficiario_nombre ?? 'Beneficiario'}`}
        descripcion={<EstadoOtorgamientoBadge estado={o.estado} />}
        acciones={
          <>
            {can('seguimiento:suspender') && activo && <Button variante="secundario" onClick={() => setDialogo({ tipo: 'estado', accion: 'SUSPENDER' })}>Suspender</Button>}
            {can('seguimiento:suspender') && suspendido && <Button variante="secundario" onClick={() => setDialogo({ tipo: 'estado', accion: 'REACTIVAR' })}>Reactivar</Button>}
            {can('seguimiento:suspender') && activo && <Button variante="secundario" onClick={() => setDialogo({ tipo: 'estado', accion: 'CUMPLIR' })}>Marcar cumplido</Button>}
            {can('seguimiento:revocar') && (activo || suspendido) && <Button onClick={() => setDialogo({ tipo: 'estado', accion: 'REVOCAR' })}>Revocar</Button>}
          </>
        }
      />
      {exito && <Alert tipo="exito" className="mb-4">{exito}</Alert>}
      {(o.excede_cupo || o.excede_presupuesto) && (
        <Alert tipo="advertencia" className="mb-4">
          Este otorgamiento fue concedido por encima {o.excede_cupo ? 'del cupo' : ''}
          {o.excede_cupo && o.excede_presupuesto ? ' y ' : ''}
          {o.excede_presupuesto ? 'del presupuesto' : ''} de la convocatoria.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card titulo="Resumen" className="lg:col-span-1">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="font-semibold">Convocatoria</dt><dd>{o.convocatoria_nombre ?? '-'}</dd>
            <dt className="font-semibold">Documento</dt><dd>{o.beneficiario_documento ?? '-'}</dd>
            <dt className="font-semibold">Aprobado</dt><dd>{formatearMoneda(o.monto_aprobado)}</dd>
            <dt className="font-semibold">Programado</dt><dd>{formatearMoneda(o.monto_programado)}</dd>
            <dt className="font-semibold">Desembolsado</dt><dd>{formatearMoneda(o.monto_desembolsado)}</dd>
            <dt className="font-semibold">Otorgado</dt><dd>{formatearFechaHora(o.otorgado_en)}</dd>
            <dt className="font-semibold">Cuenta de pago</dt>
            <dd>{o.cuenta_pago ? `${o.cuenta_pago.tipo}${o.cuenta_pago.entidad ? ` - ${o.cuenta_pago.entidad}` : ''} ${o.cuenta_pago.numero_enmascarado}` : 'No registrada'}</dd>
          </dl>
        </Card>

        <Card titulo="Historial" className="lg:col-span-2">
          {o.eventos.length === 0 ? (
            <p className="text-sm">Sin eventos registrados.</p>
          ) : (
            <ol className="border-l-2 border-primary pl-4">
              {o.eventos.map((e: EventoOtorgamientoDto) => (
                <li key={e.id} className="mb-3 last:mb-0">
                  <p className="font-semibold">{ETIQUETA_EVENTO[e.tipo]}</p>
                  <p className="text-xs text-ink/70">{formatearFechaHora(e.ocurrido_en)}</p>
                  {e.motivo && <p className="mt-1 text-sm">{e.motivo}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Desembolsos</h2>
          {puedeDesembolsar && activo && <Button onClick={() => setDialogo({ tipo: 'programar' })}>Programar desembolso</Button>}
        </div>
        <Table<DesembolsoDto>
          caption="Desembolsos del otorgamiento"
          columnas={[
            { clave: 'estado', titulo: 'Estado', render: (d) => <EstadoDesembolsoBadge estado={d.estado} /> },
            { clave: 'monto', titulo: 'Monto', alineacion: 'derecha', render: (d) => formatearMoneda(d.monto) },
            { clave: 'concepto', titulo: 'Concepto', render: (d) => d.concepto ?? '-' },
            { clave: 'programada', titulo: 'Programada', render: (d) => formatearFechaLocal(d.fecha_programada) },
            {
              clave: 'pago',
              titulo: 'Pago',
              render: (d) => (d.fecha_pago ? `${formatearFechaLocal(d.fecha_pago)}${d.referencia_pago ? ` (ref. ${d.referencia_pago})` : ''}` : d.motivo_anulacion ? `Anulado: ${d.motivo_anulacion}` : '-'),
            },
            {
              clave: 'acciones',
              titulo: 'Acciones',
              render: (d) =>
                puedeDesembolsar && d.estado === 'PROGRAMADO' ? (
                  <div className="flex flex-wrap gap-2">
                    {activo && <Button className="min-h-[32px] px-3 py-1 text-sm" onClick={() => setDialogo({ tipo: 'pagar', d })}>Registrar pago</Button>}
                    <Button variante="secundario" className="min-h-[32px] px-3 py-1 text-sm" onClick={() => setDialogo({ tipo: 'anular', d })}>Anular</Button>
                  </div>
                ) : null,
            },
          ]}
          filas={o.desembolsos}
          obtenerId={(d) => d.id}
          vacio={{ titulo: 'Sin desembolsos', descripcion: 'Aun no se han programado desembolsos.' }}
        />
      </div>

      {dialogo?.tipo === 'estado' && (
        <CambioEstadoModal
          accion={dialogo.accion}
          otorgamiento={o}
          cargando={m.cambiarEstado.isPending}
          error={m.cambiarEstado.error}
          onCerrar={cerrar}
          onConfirmar={(d) =>
            m.cambiarEstado.mutate(
              { accion: dialogo.accion, datos: { motivo: d.motivo, confirmar: true, version: o.version, ...(d.forzar ? { forzar: true } : {}) } },
              { onSuccess: () => ok('El estado del otorgamiento se actualizo correctamente.') },
            )
          }
        />
      )}
      {dialogo?.tipo === 'programar' && (
        <ProgramarDesembolsoModal
          otorgamiento={o}
          cargando={m.programar.isPending}
          error={m.programar.error}
          onCerrar={cerrar}
          onConfirmar={(d) => m.programar.mutate(d, { onSuccess: () => ok('El desembolso fue programado.') })}
        />
      )}
      {dialogo?.tipo === 'pagar' && (
        <PagarDesembolsoModal
          desembolso={dialogo.d}
          cargando={m.pagar.isPending}
          error={m.pagar.error}
          onCerrar={cerrar}
          onConfirmar={(datos) => m.pagar.mutate({ desembolsoId: dialogo.d.id, datos }, { onSuccess: () => ok('El pago fue registrado.') })}
        />
      )}
      {dialogo?.tipo === 'anular' && (
        <AnularDesembolsoModal
          desembolso={dialogo.d}
          cargando={m.anular.isPending}
          error={m.anular.error}
          onCerrar={cerrar}
          onConfirmar={(datos) => m.anular.mutate({ desembolsoId: dialogo.d.id, datos }, { onSuccess: () => ok('El desembolso fue anulado.') })}
        />
      )}
    </>
  );
}
