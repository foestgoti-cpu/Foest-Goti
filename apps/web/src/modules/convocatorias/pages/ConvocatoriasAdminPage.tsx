import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ESTADOS_CONVOCATORIA, type EstadoConvocatoria } from '@foest/shared';
import { Alert, Button, Input, PageHeader, Select, Table } from '../../../components/ui';
import { EstadoConvocatoriaBadge } from '../components/EstadoConvocatoriaBadge';
import { useConvocatorias } from '../hooks/useConvocatorias';
import type { ConvocatoriaResumen } from '../types';
import { ETIQUETA_ESTADO, formatearFechaLocal, mensajeDeError, periodo, textoDiasRestantes } from '../utils';

/** `/admin/convocatorias`: tabla de gestion con estado, fechas, postulaciones y acciones. */
export function ConvocatoriasAdminPage() {
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState<EstadoConvocatoria | ''>('');
  const [anio, setAnio] = useState('');
  const { data, isLoading, error } = useConvocatorias({ page, page_size: 20, estado, anio: anio ? Number(anio) : '' });

  return (
    <>
      <PageHeader
        titulo="Convocatorias"
        descripcion="Ciclo de vida de las convocatorias semestrales del FOEST: creacion, habilitacion, suspension, ampliacion y archivado."
        acciones={
          <Link to="/admin/convocatorias/nueva" className="no-underline hover:no-underline">
            <Button>Nueva convocatoria</Button>
          </Link>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="filtro-estado" className="mb-1 block text-sm font-semibold">
            Estado
          </label>
          <Select
            id="filtro-estado"
            placeholder="Todos"
            opciones={ESTADOS_CONVOCATORIA.map((e) => ({ valor: e, etiqueta: ETIQUETA_ESTADO[e] }))}
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value as EstadoConvocatoria | '');
              setPage(1);
            }}
          />
        </div>
        <div>
          <label htmlFor="filtro-anio" className="mb-1 block text-sm font-semibold">
            Anio
          </label>
          <Input
            id="filtro-anio"
            type="number"
            min={2024}
            max={2100}
            value={anio}
            onChange={(e) => {
              setAnio(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {error && (
        <Alert tipo="error" className="mb-4">
          {mensajeDeError(error)}
        </Alert>
      )}
      <Table<ConvocatoriaResumen>
        caption="Listado de convocatorias"
        columnas={[
          { clave: 'periodo', titulo: 'Periodo', render: (c) => <span className="font-mono">{periodo(c.anio, c.semestre)}</span> },
          {
            clave: 'nombre',
            titulo: 'Nombre',
            render: (c) => (
              <Link to={`/admin/convocatorias/${c.id}`}>{c.nombre}</Link>
            ),
          },
          { clave: 'estado', titulo: 'Estado', render: (c) => <EstadoConvocatoriaBadge estado={c.estado} abierta={c.abierta} /> },
          { clave: 'apertura', titulo: 'Apertura', render: (c) => formatearFechaLocal(c.fecha_apertura_local) },
          {
            clave: 'cierre',
            titulo: 'Cierre',
            render: (c) => (
              <span>
                {formatearFechaLocal(c.fecha_cierre)}
                {c.abierta && <span className="block text-xs text-ink/70">{textoDiasRestantes(c.dias_restantes)}</span>}
              </span>
            ),
          },
          { clave: 'beneficios', titulo: 'Beneficios', render: (c) => c.beneficios.map((b) => b.codigo).join(', ') || '-' },
          { clave: 'postulaciones', titulo: 'Postulaciones', alineacion: 'derecha', render: (c) => c.postulaciones_total ?? 0 },
          {
            clave: 'acciones',
            titulo: 'Acciones',
            render: (c) => (
              <Link to={`/admin/convocatorias/${c.id}`} className="no-underline hover:no-underline">
                <Button variante="secundario" className="min-h-[32px] px-3 py-1 text-sm">
                  Gestionar
                </Button>
              </Link>
            ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(c) => c.id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin convocatorias', descripcion: 'Cree la primera convocatoria con el boton "Nueva convocatoria".' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
    </>
  );
}
