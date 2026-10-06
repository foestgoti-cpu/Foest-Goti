import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Input, Select, Spinner, Table } from '../../../components/ui';
import { useAuditoria, useCatalogoAuditoria, useEventoAuditoria } from '../hooks/useAuditoria';
import type { AuditoriaEvento, FiltrosAuditoria } from '../types';
import { fechaHora } from './formato';

/**
 * Visor de la bitacora: filtros, tabla paginada y detalle con visor diferencial
 * (datos_antes vs datos_despues) en JSON legible. Solo UI: consume /auditoria.
 */
function aObjeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function calcularDiferencias(antes: unknown, despues: unknown): Array<{ campo: string; antes: string; despues: string; cambio: boolean }> {
  const a = aObjeto(antes);
  const d = aObjeto(despues);
  if (!a && !d) {
    if (antes === undefined && despues === undefined) return [];
    if (antes === null && despues === null) return [];
    const sa = antes == null ? '' : JSON.stringify(antes, null, 2);
    const sd = despues == null ? '' : JSON.stringify(despues, null, 2);
    return [{ campo: '(valor)', antes: sa, despues: sd, cambio: sa !== sd }];
  }
  const claves = [...new Set([...Object.keys(a ?? {}), ...Object.keys(d ?? {})])].sort();
  return claves.map((campo) => {
    const va = a && campo in a ? JSON.stringify(a[campo], null, 2) : '';
    const vd = d && campo in d ? JSON.stringify(d[campo], null, 2) : '';
    return { campo, antes: va, despues: vd, cambio: va !== vd };
  });
}

function DiffViewer({ evento }: { evento: AuditoriaEvento }) {
  const filas = calcularDiferencias(evento.datos_antes, evento.datos_despues);
  if (filas.length === 0) return <p className="text-sm text-ink/80">El evento no registra datos antes/despues.</p>;
  return (
    <div className="overflow-x-auto border border-ink">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Diferencias entre datos antes y despues</caption>
        <thead className="bg-primary-10">
          <tr>
            <th className="border-b border-ink px-3 py-2 text-left">Campo</th>
            <th className="border-b border-ink px-3 py-2 text-left">Antes</th>
            <th className="border-b border-ink px-3 py-2 text-left">Despues</th>
            <th className="border-b border-ink px-3 py-2 text-left">Cambio</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.campo} className={`border-b border-ink/30 align-top last:border-b-0 ${f.cambio ? 'bg-primary-10' : ''}`}>
              <th scope="row" className="px-3 py-1.5 text-left font-mono text-xs font-semibold">
                {f.campo}
              </th>
              <td className="px-3 py-1.5">
                <pre className="whitespace-pre-wrap break-all font-mono text-xs">{f.antes || '—'}</pre>
              </td>
              <td className="px-3 py-1.5">
                <pre className="whitespace-pre-wrap break-all font-mono text-xs">{f.despues || '—'}</pre>
              </td>
              <td className="px-3 py-1.5">{f.cambio ? <Badge tono="relleno">Modificado</Badge> : <Badge tono="neutro">Sin cambio</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetalleEvento({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const { data, isLoading, error } = useEventoAuditoria(id);
  return (
    <Card
      titulo="Detalle del evento"
      acciones={
        <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={onCerrar}>
          Cerrar detalle
        </Button>
      }
      className="mt-4"
    >
      {isLoading && <Spinner />}
      {error && <Alert tipo="error">{(error as Error).message}</Alert>}
      {data && (
        <>
          <dl className="mb-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="font-semibold">Secuencia</dt>
              <dd className="tabular-nums">{data.secuencia}</dd>
            </div>
            <div>
              <dt className="font-semibold">Registrado</dt>
              <dd>{fechaHora(data.registrado_en)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Accion / entidad</dt>
              <dd>
                {data.accion} sobre {data.entidad} {data.entidad_id ? <span className="font-mono text-xs">{data.entidad_id}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Actor</dt>
              <dd>
                {data.actor_tipo} {data.actor_rol ? `(${data.actor_rol})` : ''} {data.actor_id ? <span className="font-mono text-xs">{data.actor_id}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Resultado</dt>
              <dd>{data.resultado}</dd>
            </div>
            <div>
              <dt className="font-semibold">Origen</dt>
              <dd className="break-all">
                {data.ip_origen ?? '—'} · <span className="font-mono text-xs">{data.request_id ?? 'sin request_id'}</span>
              </dd>
            </div>
          </dl>
          <h3 className="mb-2 text-base">Diferencias</h3>
          <DiffViewer evento={data} />
          {data.metadatos && Object.keys(data.metadatos).length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-base">Metadatos</h3>
              <pre className="overflow-x-auto border border-ink bg-primary-10 p-3 font-mono text-xs">{JSON.stringify(data.metadatos, null, 2)}</pre>
            </>
          )}
          <p className="mt-3 text-xs text-ink/70">La consulta de este detalle quedo registrada en la bitacora como LECTURA_SENSIBLE.</p>
        </>
      )}
    </Card>
  );
}

export function AuditoriaLogViewer() {
  const { data: catalogo } = useCatalogoAuditoria();
  const [borrador, setBorrador] = useState<FiltrosAuditoria>({});
  const [filtros, setFiltros] = useState<FiltrosAuditoria>({});
  const [page, setPage] = useState(1);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const { data, isLoading, error } = useAuditoria(filtros, page);

  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    const limpio: FiltrosAuditoria = {};
    for (const [k, v] of Object.entries(borrador)) if (v && v.trim() !== '') (limpio as Record<string, string>)[k] = v.trim();
    setFiltros(limpio);
    setPage(1);
    setSeleccionado(null);
  };
  const campo = (k: keyof FiltrosAuditoria) => ({ value: borrador[k] ?? '', onChange: (e: { target: { value: string } }) => setBorrador({ ...borrador, [k]: e.target.value }) });
  const opciones = (lista?: string[]) => (lista ?? []).map((v) => ({ valor: v, etiqueta: v }));

  return (
    <>
      <Card titulo="Filtros" className="mb-4">
        <form onSubmit={aplicar} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Entidad</span>
            <Select opciones={opciones(catalogo?.entidades)} placeholder="Todas" {...campo('entidad')} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Accion</span>
            <Select opciones={opciones(catalogo?.acciones)} placeholder="Todas" {...campo('accion')} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Resultado</span>
            <Select opciones={opciones(catalogo?.resultados)} placeholder="Todos" {...campo('resultado')} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Identificador de entidad</span>
            <Input {...campo('entidad_id')} autoComplete="off" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Actor (uuid)</span>
            <Input {...campo('actor_id')} autoComplete="off" placeholder="Filtrar por actor queda auditado" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Request id</span>
            <Input {...campo('request_id')} autoComplete="off" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Desde</span>
            <Input type="date" {...campo('desde')} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Hasta</span>
            <Input type="date" {...campo('hasta')} />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit">Consultar</Button>
            <Button
              type="button"
              variante="secundario"
              onClick={() => {
                setBorrador({});
                setFiltros({});
                setPage(1);
              }}
            >
              Limpiar
            </Button>
          </div>
        </form>
      </Card>
      {error && <Alert tipo="error" className="mb-4">{(error as Error).message}</Alert>}
      <Table<AuditoriaEvento>
        caption="Eventos de auditoria"
        columnas={[
          { clave: 'registrado_en', titulo: 'Fecha', render: (e) => fechaHora(e.registrado_en) },
          { clave: 'accion', titulo: 'Accion', render: (e) => <span className="font-mono text-xs">{e.accion}</span> },
          {
            clave: 'entidad',
            titulo: 'Entidad',
            render: (e) => (
              <span>
                {e.entidad}
                {e.entidad_id && <span className="block font-mono text-xs text-ink/70">{e.entidad_id}</span>}
              </span>
            ),
          },
          { clave: 'actor', titulo: 'Actor', render: (e) => `${e.actor_tipo}${e.actor_rol ? ` (${e.actor_rol})` : ''}` },
          { clave: 'resultado', titulo: 'Resultado', render: (e) => <Badge tono={e.resultado === 'EXITO' ? 'neutro' : 'relleno'}>{e.resultado}</Badge> },
          {
            clave: 'detalle',
            titulo: 'Detalle',
            render: (e) => (
              <Button variante="texto" className="min-h-[32px] px-2 py-0 text-sm" onClick={() => setSeleccionado(e.id)}>
                Ver diferencias
              </Button>
            ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(e) => e.id}
        cargando={isLoading && !data}
        vacio={{ titulo: 'Sin eventos', descripcion: 'No hay eventos que coincidan con los filtros.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
      {seleccionado && <DetalleEvento id={seleccionado} onCerrar={() => setSeleccionado(null)} />}
    </>
  );
}
