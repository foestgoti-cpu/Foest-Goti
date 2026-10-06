import { useState } from 'react';
import { Alert, Badge, Button, Card, Spinner, Table } from '../../../components/ui';
import { usePermissions } from '../../roles_permissions';
import { fechaHora } from '../formato';
import { useAuditoria, useCatalogoAuditoria, useEventoAuditoria, useLineaTiempoAuditoria } from '../hooks/useAuditoria';
import { ETIQUETA_RESULTADO, FILTROS_VACIOS, type AuditoriaEvento, type AuditoriaFiltros as Filtros, type FiltrosFormulario } from '../types';
import { AuditoriaFiltros } from './AuditoriaFiltros';
import { ExportarAuditoriaModal } from './ExportarAuditoriaModal';

/**
 * Visor de la bitacora: filtros, tabla paginada, detalle con visor diferencial
 * (datos_antes vs datos_despues), linea de tiempo por entidad y exportacion CSV.
 * Solo UI: consume /auditoria.
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

function ResumenEvento({ e }: { e: AuditoriaEvento }) {
  return (
    <dl className="mb-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <dt className="font-semibold">Secuencia</dt>
        <dd className="tabular-nums">{e.secuencia}</dd>
      </div>
      <div>
        <dt className="font-semibold">Registrado</dt>
        <dd>{fechaHora(e.registrado_en)}</dd>
      </div>
      <div>
        <dt className="font-semibold">Accion / entidad</dt>
        <dd>
          {e.accion} sobre {e.entidad} {e.entidad_id ? <span className="font-mono text-xs">{e.entidad_id}</span> : null}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Actor</dt>
        <dd>
          {e.actor_tipo} {e.actor_rol ? `(${e.actor_rol})` : ''} {e.actor_id ? <span className="font-mono text-xs">{e.actor_id}</span> : null}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Resultado</dt>
        <dd>{ETIQUETA_RESULTADO[e.resultado] ?? e.resultado}</dd>
      </div>
      <div>
        <dt className="font-semibold">Origen</dt>
        <dd className="break-all">
          {e.ip_origen ?? '—'} · <span className="font-mono text-xs">{e.request_id ?? 'sin request_id'}</span>
        </dd>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <dt className="font-semibold">Cadena de hashes</dt>
        <dd className="break-all font-mono text-xs">
          previo: {e.hash_previo ?? '—'}
          <br />
          evento: {e.hash_evento ?? '—'}
        </dd>
      </div>
    </dl>
  );
}

function DetalleEvento({ id, onCerrar, onLineaTiempo }: { id: string; onCerrar: () => void; onLineaTiempo: (entidad: string, entidadId: string) => void }) {
  const { data, isLoading, error } = useEventoAuditoria(id);
  return (
    <Card
      titulo="Detalle del evento"
      className="mt-4"
      acciones={
        <>
          {data?.entidad_id && (
            <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={() => onLineaTiempo(data.entidad, data.entidad_id as string)}>
              Ver linea de tiempo de la entidad
            </Button>
          )}
          <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={onCerrar}>
            Cerrar detalle
          </Button>
        </>
      }
    >
      {isLoading && <Spinner />}
      {error && <Alert tipo="error">{(error as Error).message}</Alert>}
      {data && (
        <>
          <ResumenEvento e={data} />
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

function LineaTiempoEntidad({ entidad, entidadId, onCerrar, onVerEvento }: { entidad: string; entidadId: string; onCerrar: () => void; onVerEvento: (id: string) => void }) {
  const { data, isLoading, error } = useLineaTiempoAuditoria(entidad, entidadId);
  return (
    <Card
      titulo={`Linea de tiempo: ${entidad} ${entidadId}`}
      className="mt-4"
      acciones={
        <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={onCerrar}>
          Cerrar linea de tiempo
        </Button>
      }
    >
      {isLoading && <Spinner />}
      {error && <Alert tipo="error">{(error as Error).message}</Alert>}
      {data && data.data.length === 0 && <p className="text-sm">La entidad no tiene eventos registrados.</p>}
      {data && data.data.length > 0 && (
        <ol className="divide-y divide-ink/30 border border-ink text-sm">
          {data.data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="tabular-nums">{fechaHora(e.registrado_en)}</span> · <span className="font-mono text-xs">{e.accion}</span> · {e.actor_tipo}
                {e.actor_rol ? ` (${e.actor_rol})` : ''} · {ETIQUETA_RESULTADO[e.resultado] ?? e.resultado}
              </span>
              <Button variante="texto" className="min-h-[32px] px-2 py-0 text-sm" onClick={() => onVerEvento(e.id)}>
                Ver detalle
              </Button>
            </li>
          ))}
        </ol>
      )}
      {data && data.total > data.data.length && (
        <p className="mt-2 text-xs text-ink/70">
          Se muestran {data.data.length} de {data.total} eventos; use los filtros para acotar.
        </p>
      )}
      <p className="mt-3 text-xs text-ink/70">La consulta de esta linea de tiempo quedo registrada en la bitacora como LECTURA_SENSIBLE.</p>
    </Card>
  );
}

export function AuditoriaLogViewer() {
  const { can } = usePermissions();
  const { data: catalogo } = useCatalogoAuditoria();
  const [borrador, setBorrador] = useState<FiltrosFormulario>({ ...FILTROS_VACIOS });
  const [filtros, setFiltros] = useState<Filtros>({});
  const [page, setPage] = useState(1);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [linea, setLinea] = useState<{ entidad: string; entidadId: string } | null>(null);
  const [exportarAbierto, setExportarAbierto] = useState(false);
  const { data, isLoading, error } = useAuditoria(filtros, page);

  return (
    <>
      <AuditoriaFiltros
        catalogo={catalogo}
        borrador={borrador}
        onCambiar={setBorrador}
        onAplicar={(f) => {
          setFiltros(f);
          setPage(1);
          setSeleccionado(null);
          setLinea(null);
        }}
        onLimpiar={() => {
          setFiltros({});
          setPage(1);
          setSeleccionado(null);
          setLinea(null);
        }}
      />
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      {can('auditoria:exportar') && (
        <div className="mb-3 flex justify-end">
          <Button variante="secundario" onClick={() => setExportarAbierto(true)} disabled={!data}>
            Exportar resultado a CSV
          </Button>
        </div>
      )}
      <Table<AuditoriaEvento>
        caption="Eventos de auditoria"
        columnas={[
          { clave: 'secuencia', titulo: 'Seq.', render: (e) => <span className="tabular-nums">{e.secuencia}</span>, alineacion: 'derecha' },
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
          {
            clave: 'resultado',
            titulo: 'Resultado',
            render: (e) => <Badge tono={e.resultado === 'EXITO' ? 'neutro' : 'relleno'}>{ETIQUETA_RESULTADO[e.resultado] ?? e.resultado}</Badge>,
          },
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
      {seleccionado && (
        <DetalleEvento
          id={seleccionado}
          onCerrar={() => setSeleccionado(null)}
          onLineaTiempo={(entidad, entidadId) => setLinea({ entidad, entidadId })}
        />
      )}
      {linea && <LineaTiempoEntidad entidad={linea.entidad} entidadId={linea.entidadId} onCerrar={() => setLinea(null)} onVerEvento={setSeleccionado} />}
      <ExportarAuditoriaModal abierto={exportarAbierto} filtros={filtros} onCerrar={() => setExportarAbierto(false)} />
    </>
  );
}
