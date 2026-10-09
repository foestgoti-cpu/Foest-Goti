import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, PageHeader, Spinner, Table } from '../../../components/ui';
import { EstadoConvocatoriaBadge } from '../components/EstadoConvocatoriaBadge';
import { AmpliacionesTable, HistorialEstadosTable } from '../components/HistorialTablas';
import { useConvocatoria, useConvocatorias } from '../hooks/useConvocatorias';
import type { ConvocatoriaResumen } from '../types';
import { formatearFechaLocal, formatearMoneda, mensajeDeError, periodo, textoDiasRestantes } from '../utils';

/** `/funcionario/convocatorias`: solo lectura de las convocatorias del comite del funcionario. */
export function ConvocatoriasFuncionarioPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useConvocatorias({ page, page_size: 20 });
  return (
    <>
      <PageHeader titulo="Mis convocatorias" descripcion="Convocatorias en cuyo comite evaluador usted participa o ha participado. Vista de solo lectura." />
      {error && (
        <Alert tipo="error" className="mb-4">
          {mensajeDeError(error)}
        </Alert>
      )}
      <Table<ConvocatoriaResumen>
        caption="Convocatorias de mi comite"
        columnas={[
          { clave: 'periodo', titulo: 'Periodo', render: (c) => <span className="font-mono">{periodo(c.anio, c.semestre)}</span> },
          { clave: 'nombre', titulo: 'Nombre', render: (c) => <Link to={`/funcionario/convocatorias/${c.id}`}>{c.nombre}</Link> },
          { clave: 'estado', titulo: 'Estado', render: (c) => <EstadoConvocatoriaBadge estado={c.estado} abierta={c.abierta} /> },
          { clave: 'cierre', titulo: 'Cierre', render: (c) => `${formatearFechaLocal(c.fecha_cierre)}${c.abierta ? ` (${textoDiasRestantes(c.dias_restantes)})` : ''}` },
          { clave: 'beneficios', titulo: 'Beneficios', render: (c) => c.beneficios.map((b) => b.codigo).join(', ') || '-' },
          { clave: 'postulaciones', titulo: 'Postulaciones', alineacion: 'derecha', render: (c) => c.postulaciones_total ?? 0 },
        ]}
        filas={data?.data ?? []}
        obtenerId={(c) => c.id}
        cargando={isLoading}
        vacio={{ titulo: 'No participa en ningun comite', descripcion: 'Cuando un administrador lo asigne al comite de una convocatoria, aparecera aqui.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
    </>
  );
}

/** `/funcionario/convocatorias/:id`: detalle de solo lectura (404 si no es de su comite). */
export function ConvocatoriaFuncionarioDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, isLoading, error } = useConvocatoria(id);
  if (isLoading) return <Spinner etiqueta="Cargando convocatoria" />;
  if (error || !c) {
    return (
      <Card titulo="Convocatoria">
        <Alert tipo="info">La convocatoria no existe o no pertenece a su comite.</Alert>
        <Link to="/funcionario/convocatorias" className="mt-4 inline-block no-underline hover:no-underline">
          <Button variante="secundario">Volver</Button>
        </Link>
      </Card>
    );
  }
  return (
    <>
      <PageHeader
        titulo={`${c.nombre} (${periodo(c.anio, c.semestre)})`}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <EstadoConvocatoriaBadge estado={c.estado} abierta={c.abierta} />
            <span>
              Apertura {formatearFechaLocal(c.fecha_apertura_local)} - Cierre {formatearFechaLocal(c.fecha_cierre)} 23:59:59
            </span>
          </span>
        }
        migas={[{ etiqueta: 'Mis convocatorias', ruta: '/funcionario/convocatorias' }, { etiqueta: c.nombre }]}
      />
      <div className="space-y-4">
        <Card titulo="Beneficios ofertados">
          {c.descripcion && <p className="mb-3">{c.descripcion}</p>}
          <ul className="divide-y divide-ink/30 border border-ink/30 rounded-lg overflow-hidden text-sm">
            {c.beneficios.map((b) => (
              <li key={b.codigo} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>
                  {b.nombre} <span className="font-mono text-xs text-ink/70">{b.codigo}</span>
                </span>
                <span>
                  Cupos: {b.cupos_estimados} - Valor referencial: {formatearMoneda(b.valor_apoyo_referencial)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card titulo="Postulaciones por estado">
          <dl className="grid gap-2 text-sm sm:grid-cols-4">
            {Object.entries(c.postulaciones_por_estado).map(([e, n]) => (
              <div key={e} className="border border-ink/30 rounded-lg px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-ink/70">{e.replace('_', ' ')}</dt>
                <dd className="text-lg font-semibold">{n}</dd>
              </div>
            ))}
            {Object.keys(c.postulaciones_por_estado).length === 0 && <p>Aun no hay postulaciones.</p>}
          </dl>
        </Card>
        <Card titulo="Ampliaciones">
          <AmpliacionesTable ampliaciones={c.ampliaciones} />
        </Card>
        <Card titulo="Historial de estados">
          <HistorialEstadosTable cambios={c.cambios_estado} />
        </Card>
      </div>
    </>
  );
}
