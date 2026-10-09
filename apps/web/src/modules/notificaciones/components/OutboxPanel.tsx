import { useState } from 'react';
import { CATALOGO_TIPOS_NOTIFICACION, ESTADOS_OUTBOX, TIPOS_NOTIFICACION } from '@foest/shared';
import { Alert, Badge, Button, Card, Modal, Select, Table, type Columna } from '../../../components/ui';
import { useOutbox, useReintentarOutbox } from '../hooks/useNotificacionesAdmin';
import type { EstadoOutbox, EventoOutbox } from '../types';
import { textoFechaHora } from './formato';

const TEXTO_ESTADO: Record<EstadoOutbox, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  ENVIADO: 'Enviado',
  FALLIDO: 'Fallido (reintenta)',
  MUERTO: 'Muerto',
  SUPRIMIDO: 'Suprimido',
};

function tonoEstado(estado: EstadoOutbox): 'neutro' | 'destacado' | 'relleno' {
  if (estado === 'MUERTO') return 'relleno';
  if (estado === 'FALLIDO' || estado === 'SUPRIMIDO') return 'destacado';
  return 'neutro';
}

/** Bandeja de salida: conteos por estado, filtros y reintento manual (doble intencion). */
export function OutboxPanel() {
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('');
  const [aReintentar, setAReintentar] = useState<EventoOutbox | null>(null);
  const outbox = useOutbox({ page, estado: estado || undefined, tipo: tipo || undefined });
  const reintentar = useReintentarOutbox();

  const columnas: Columna<EventoOutbox>[] = [
    { clave: 'creado', titulo: 'Creado', render: (e) => <time dateTime={e.creado_en}>{textoFechaHora(e.creado_en)}</time> },
    { clave: 'tipo', titulo: 'Tipo', render: (e) => CATALOGO_TIPOS_NOTIFICACION[e.tipo as keyof typeof CATALOGO_TIPOS_NOTIFICACION]?.etiqueta ?? e.tipo },
    { clave: 'asunto', titulo: 'Asunto', render: (e) => e.asunto ?? '-' },
    { clave: 'estado', titulo: 'Estado', render: (e) => <Badge tono={tonoEstado(e.estado)} className={e.estado === 'MUERTO' || e.estado === 'FALLIDO' ? 'border-danger! bg-danger-10! text-danger!' : undefined}>{TEXTO_ESTADO[e.estado]}</Badge> },
    { clave: 'intentos', titulo: 'Intentos', alineacion: 'derecha', render: (e) => e.intentos },
    { clave: 'proximo', titulo: 'Proximo intento', render: (e) => (e.estado === 'PENDIENTE' || e.estado === 'FALLIDO' ? textoFechaHora(e.proximo_intento_en) : '-') },
    { clave: 'error', titulo: 'Ultimo error', className: 'max-w-xs break-words', render: (e) => e.ultimo_error ?? '-' },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      render: (e) =>
        e.estado === 'FALLIDO' || e.estado === 'MUERTO' || e.estado === 'SUPRIMIDO' ? (
          <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={() => setAReintentar(e)}>
            Reintentar
          </Button>
        ) : null,
    },
  ];

  return (
    <Card
      titulo="Bandeja de salida de correo"
      acciones={
        outbox.data && (
          <span className="text-sm">
            Pendiente mas antiguo: {outbox.data.edad_pendiente_mas_antiguo_seg === 0 ? 'ninguno' : `${Math.round(outbox.data.edad_pendiente_mas_antiguo_seg / 60)} min`}
          </span>
        )
      }
    >
      {outbox.data && (
        <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {ESTADOS_OUTBOX.map((e) => (
            <div key={e} className="border border-ink rounded-lg px-3 py-2">
              <dt className="text-xs uppercase tracking-wide text-ink/70">{TEXTO_ESTADO[e]}</dt>
              <dd className="text-xl font-semibold">{outbox.data.conteos[e]}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mb-4 flex flex-wrap gap-4">
        <label className="block text-sm font-semibold">
          Estado
          <Select
            className="mt-1"
            value={estado}
            placeholder="Todos"
            opciones={ESTADOS_OUTBOX.map((e) => ({ valor: e, etiqueta: TEXTO_ESTADO[e] }))}
            onChange={(ev) => {
              setEstado(ev.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="block text-sm font-semibold">
          Tipo
          <Select
            className="mt-1"
            value={tipo}
            placeholder="Todos"
            opciones={TIPOS_NOTIFICACION.map((t) => ({ valor: t, etiqueta: CATALOGO_TIPOS_NOTIFICACION[t].etiqueta }))}
            onChange={(ev) => {
              setTipo(ev.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {outbox.error && <Alert tipo="error">{(outbox.error as Error).message}</Alert>}
      {reintentar.isSuccess && <Alert tipo="exito" className="mb-3">El evento fue reencolado y se enviara en el proximo ciclo del worker.</Alert>}
      {reintentar.error && <Alert tipo="error" className="mb-3">{(reintentar.error as Error).message}</Alert>}
      <Table
        columnas={columnas}
        filas={outbox.data?.data ?? []}
        obtenerId={(e) => e.id}
        cargando={outbox.isLoading}
        caption="Eventos del outbox de correo"
        vacio={{ titulo: 'Sin eventos', descripcion: 'No hay correos con el filtro actual.' }}
        paginacion={outbox.data ? { page: outbox.data.page, page_size: outbox.data.page_size, total: outbox.data.total, onCambiarPagina: setPage } : undefined}
      />
      <Modal
        abierto={aReintentar !== null}
        titulo="Reintentar envio de correo"
        onCerrar={() => setAReintentar(null)}
        textoConfirmar="Reencolar"
        cargando={reintentar.isPending}
        confirmacion={{ palabra: 'REINTENTAR', comprension: 'Entiendo que el correo se enviara de nuevo a todos los destinatarios no suprimidos.' }}
        onConfirmar={async () => {
          if (!aReintentar) return;
          await reintentar.mutateAsync(aReintentar.id).catch(() => undefined);
          setAReintentar(null);
        }}
      >
        {aReintentar && (
          <p>
            Evento de tipo <strong>{aReintentar.tipo}</strong> en estado {TEXTO_ESTADO[aReintentar.estado]} con {aReintentar.intentos} intento(s). Esta accion queda registrada en auditoria.
          </p>
        )}
      </Modal>
    </Card>
  );
}
