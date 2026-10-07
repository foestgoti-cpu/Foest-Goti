import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CODIGOS_BENEFICIO, ESTADOS_OTORGAMIENTO, type CodigoBeneficio, type EstadoOtorgamiento, type OtorgamientoDto } from '@foest/shared';
import { Alert, Button, Input, PageHeader, Select, Table } from '../../../components/ui';
import { EstadoOtorgamientoBadge } from '../components/EstadoBadges';
import { useConvocatoriasFiltro, useOtorgamientos } from '../hooks/useSeguimiento';
import { ETIQUETA_ESTADO_OTORGAMIENTO, formatearFechaHora, formatearMoneda, mensajeDeError, nombreBeneficio } from '../utils';

/** `/admin/seguimiento`: otorgamientos con filtros y estado. */
export function OtorgamientosPage() {
  const [page, setPage] = useState(1);
  const [convocatoria, setConvocatoria] = useState('');
  const [beneficio, setBeneficio] = useState<CodigoBeneficio | ''>('');
  const [estado, setEstado] = useState<EstadoOtorgamiento | ''>('');
  const [q, setQ] = useState('');
  const convocatorias = useConvocatoriasFiltro();
  const { data, isLoading, error } = useOtorgamientos({ page, convocatoria_id: convocatoria || undefined, beneficio, estado, q: q.trim() || undefined });
  const reiniciar = () => setPage(1);

  return (
    <>
      <PageHeader
        titulo="Seguimiento de beneficios"
        descripcion="Otorgamientos vigentes, desembolsos y estado de cada beneficio concedido."
        acciones={
          <>
            <Link to="/admin/seguimiento/cupos" className="no-underline hover:no-underline">
              <Button variante="secundario">Cupos y presupuesto</Button>
            </Link>
            <Link to="/admin/seguimiento/carga-pagos" className="no-underline hover:no-underline">
              <Button variante="secundario">Carga masiva de pagos</Button>
            </Link>
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="f-conv" className="mb-1 block text-sm font-semibold">
            Convocatoria
          </label>
          <Select
            id="f-conv"
            placeholder="Todas"
            opciones={(convocatorias.data?.data ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
            value={convocatoria}
            onChange={(e) => {
              setConvocatoria(e.target.value);
              reiniciar();
            }}
          />
        </div>
        <div>
          <label htmlFor="f-ben" className="mb-1 block text-sm font-semibold">
            Beneficio
          </label>
          <Select
            id="f-ben"
            placeholder="Todos"
            opciones={CODIGOS_BENEFICIO.map((c) => ({ valor: c, etiqueta: nombreBeneficio(c) }))}
            value={beneficio}
            onChange={(e) => {
              setBeneficio(e.target.value as CodigoBeneficio | '');
              reiniciar();
            }}
          />
        </div>
        <div>
          <label htmlFor="f-est" className="mb-1 block text-sm font-semibold">
            Estado
          </label>
          <Select
            id="f-est"
            placeholder="Todos"
            opciones={ESTADOS_OTORGAMIENTO.map((e) => ({ valor: e, etiqueta: ETIQUETA_ESTADO_OTORGAMIENTO[e] }))}
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value as EstadoOtorgamiento | '');
              reiniciar();
            }}
          />
        </div>
        <div>
          <label htmlFor="f-q" className="mb-1 block text-sm font-semibold">
            Buscar
          </label>
          <Input
            id="f-q"
            value={q}
            placeholder="Nombre o documento"
            onChange={(e) => {
              setQ(e.target.value);
              reiniciar();
            }}
          />
        </div>
      </div>
      {error && (
        <Alert tipo="error" className="mb-4">
          {mensajeDeError(error)}
        </Alert>
      )}
      <Table<OtorgamientoDto>
        caption="Listado de otorgamientos"
        columnas={[
          {
            clave: 'beneficiario',
            titulo: 'Beneficiario',
            render: (o) => (
              <Link to={`/admin/seguimiento/${o.id}`}>
                {o.beneficiario_nombre ?? 'Sin nombre'}
                {o.beneficiario_documento && <span className="block text-xs text-ink/70">{o.beneficiario_documento}</span>}
              </Link>
            ),
          },
          { clave: 'convocatoria', titulo: 'Convocatoria', render: (o) => o.convocatoria_nombre ?? '-' },
          { clave: 'beneficio', titulo: 'Beneficio', render: (o) => nombreBeneficio(o.beneficio_codigo, o.beneficio_nombre) },
          { clave: 'estado', titulo: 'Estado', render: (o) => <EstadoOtorgamientoBadge estado={o.estado} /> },
          { clave: 'aprobado', titulo: 'Aprobado', alineacion: 'derecha', render: (o) => formatearMoneda(o.monto_aprobado) },
          { clave: 'desembolsado', titulo: 'Desembolsado', alineacion: 'derecha', render: (o) => formatearMoneda(o.monto_desembolsado) },
          { clave: 'otorgado', titulo: 'Otorgado', render: (o) => formatearFechaHora(o.otorgado_en) },
        ]}
        filas={data?.data ?? []}
        obtenerId={(o) => o.id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin otorgamientos', descripcion: 'No hay otorgamientos que coincidan con los filtros.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
    </>
  );
}
