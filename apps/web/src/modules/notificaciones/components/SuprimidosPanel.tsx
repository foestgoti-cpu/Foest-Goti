import { useState } from 'react';
import { Alert, Button, Card, Modal, Spinner, Table, Textarea, type Columna } from '../../../components/ui';
import { useEntregabilidad, useLevantarSupresion } from '../hooks/useNotificacionesAdmin';
import type { DestinatarioSuprimido } from '../types';
import { textoFechaHora } from './formato';

const TEXTO_MOTIVO = { REBOTE_DURO: 'Rebote duro', QUEJA: 'Queja', MANUAL: 'Manual' } as const;

/** Resumen de entregabilidad y destinatarios suprimidos con levantamiento auditado. */
export function SuprimidosPanel() {
  const resumen = useEntregabilidad();
  const levantar = useLevantarSupresion();
  const [seleccionado, setSeleccionado] = useState<DestinatarioSuprimido | null>(null);
  const [motivo, setMotivo] = useState('');

  const columnas: Columna<DestinatarioSuprimido>[] = [
    { clave: 'email', titulo: 'Correo', className: 'break-all', render: (s) => s.email },
    { clave: 'motivo', titulo: 'Motivo', render: (s) => TEXTO_MOTIVO[s.motivo] },
    { clave: 'desde', titulo: 'Desde', render: (s) => textoFechaHora(s.desde) },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      render: (s) => (
        <Button
          variante="secundario"
          className="min-h-[36px] px-3 py-1 text-sm"
          onClick={() => {
            setSeleccionado(s);
            setMotivo('');
          }}
        >
          Levantar supresion
        </Button>
      ),
    },
  ];

  return (
    <Card titulo="Entregabilidad y destinatarios suprimidos">
      {resumen.isLoading && <Spinner etiqueta="Cargando entregabilidad" />}
      {resumen.error && <Alert tipo="error">{(resumen.error as Error).message}</Alert>}
      {resumen.data && (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ['Enviadas (24 h)', resumen.data.ultimas_24h.enviadas],
              ['Entregadas (24 h)', resumen.data.ultimas_24h.entregadas],
              ['Rebotadas (24 h)', resumen.data.ultimas_24h.rebotadas],
              ['Quejas (24 h)', resumen.data.ultimas_24h.quejas],
              ['Suprimidos activos', resumen.data.totales.suprimidos_activos],
            ].map(([etiqueta, valor]) => (
              <div key={String(etiqueta)} className="border border-ink rounded-lg px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-ink/70">{etiqueta}</dt>
                <dd className="text-xl font-semibold">{valor}</dd>
              </div>
            ))}
          </dl>
          {(resumen.data.outbox.MUERTO > 0 || resumen.data.outbox.edad_pendiente_mas_antiguo_seg > 900) && (
            <Alert tipo="advertencia" className="mb-4">
              {resumen.data.outbox.MUERTO > 0 ? `Hay ${resumen.data.outbox.MUERTO} correo(s) en estado MUERTO. ` : ''}
              {resumen.data.outbox.edad_pendiente_mas_antiguo_seg > 900 ? 'La cola de correo parece atascada: el evento pendiente mas antiguo supera los 15 minutos.' : ''}
            </Alert>
          )}
        </>
      )}
      {levantar.isSuccess && <Alert tipo="exito" className="mb-3">La supresion fue levantada; los proximos correos a esa direccion se enviaran normalmente.</Alert>}
      {levantar.error && <Alert tipo="error" className="mb-3">{(levantar.error as Error).message}</Alert>}
      <Table
        columnas={columnas}
        filas={resumen.data?.suprimidos ?? []}
        obtenerId={(s) => s.email}
        cargando={resumen.isLoading}
        caption="Destinatarios suprimidos"
        vacio={{ titulo: 'Sin destinatarios suprimidos', descripcion: 'No hay correos bloqueados por rebote o queja.' }}
      />
      <Modal
        abierto={seleccionado !== null}
        titulo="Levantar supresion de correo"
        onCerrar={() => setSeleccionado(null)}
        textoConfirmar="Levantar supresion"
        cargando={levantar.isPending}
        confirmacion={{ palabra: 'LEVANTAR', comprension: 'Confirmo que la direccion fue verificada o corregida y entiendo que esta accion queda en auditoria.' }}
        onConfirmar={async () => {
          if (!seleccionado || motivo.trim().length < 15) return;
          await levantar.mutateAsync({ email: seleccionado.email, motivo: motivo.trim() }).catch(() => undefined);
          setSeleccionado(null);
        }}
      >
        {seleccionado && (
          <div className="flex flex-col gap-3">
            <p>
              Correo: <strong className="break-all">{seleccionado.email}</strong> (motivo: {TEXTO_MOTIVO[seleccionado.motivo]}).
            </p>
            <label className="block text-sm font-semibold">
              Motivo del levantamiento (minimo 15 caracteres)
              <Textarea className="mt-1" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
            </label>
            {motivo.trim().length > 0 && motivo.trim().length < 15 && <p className="text-sm text-danger" role="alert">El motivo debe tener al menos 15 caracteres.</p>}
          </div>
        )}
      </Modal>
    </Card>
  );
}
