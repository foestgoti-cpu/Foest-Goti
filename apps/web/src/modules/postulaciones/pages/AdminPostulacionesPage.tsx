import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ESTADOS_POSTULACION, TIPOS_SOLICITUD, textoEstadoBeneficiario, type EstadoPostulacion, type TipoSolicitud } from '@foest/shared';
import { Alert, Badge, Button, Card, FormField, Input, PageHeader, Select, Table } from '../../../components/ui';
import { usePostulacionesAdmin } from '../hooks/usePostulaciones';
import { fechaCorta, TEXTO_TIPO_SOLICITUD } from '../formato';
import type { FiltrosAdmin, PostulacionAdmin } from '../types';

export function AdminPostulacionesPage() {
  const [borrador, setBorrador] = useState<FiltrosAdmin>({ page: 1, convocatoria_id: '', estado: '', tipo_solicitud: '', q: '' });
  const [filtros, setFiltros] = useState<FiltrosAdmin>({ page: 1 });
  const { data, isLoading, error } = usePostulacionesAdmin(filtros);

  const aplicar = () => {
    setFiltros({
      page: 1,
      convocatoria_id: borrador.convocatoria_id?.trim() || undefined,
      estado: borrador.estado || undefined,
      tipo_solicitud: borrador.tipo_solicitud || undefined,
      q: borrador.q?.trim() || undefined,
    });
  };

  return (
    <>
      <PageHeader titulo="Postulaciones" descripcion="Listado global de solo lectura. Cada consulta y cada apertura de detalle quedan registradas en la auditoria." />
      <Card titulo="Filtros" className="mb-4">
        <form
          className="grid grid-cols-1 gap-x-4 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            aplicar();
          }}
        >
          <FormField etiqueta="Buscar (nombre o documento)" nombre="q">
            <Input value={borrador.q ?? ''} onChange={(e) => setBorrador({ ...borrador, q: e.target.value })} />
          </FormField>
          <FormField etiqueta="Estado" nombre="estado">
            <Select
              placeholder="Todos"
              opciones={ESTADOS_POSTULACION.map((s) => ({ valor: s, etiqueta: textoEstadoBeneficiario(s) }))}
              value={borrador.estado ?? ''}
              onChange={(e) => setBorrador({ ...borrador, estado: e.target.value as EstadoPostulacion | '' })}
            />
          </FormField>
          <FormField etiqueta="Tipo de tramite" nombre="tipo">
            <Select
              placeholder="Todos"
              opciones={TIPOS_SOLICITUD.map((t) => ({ valor: t, etiqueta: TEXTO_TIPO_SOLICITUD[t] ?? t }))}
              value={borrador.tipo_solicitud ?? ''}
              onChange={(e) => setBorrador({ ...borrador, tipo_solicitud: e.target.value as TipoSolicitud | '' })}
            />
          </FormField>
          <FormField etiqueta="Convocatoria (id)" nombre="convocatoria_id">
            <Input value={borrador.convocatoria_id ?? ''} onChange={(e) => setBorrador({ ...borrador, convocatoria_id: e.target.value })} />
          </FormField>
          <div className="md:col-span-4">
            <Button type="submit">Aplicar filtros</Button>
          </div>
        </form>
      </Card>
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      <Table<PostulacionAdmin>
        caption="Postulaciones"
        columnas={[
          {
            clave: 'beneficiario',
            titulo: 'Beneficiario',
            render: (p) => (
              <span>
                {p.beneficiario ? `${p.beneficiario.nombres ?? ''} ${p.beneficiario.apellidos ?? ''}`.trim() || '-' : '-'}
                <span className="block text-xs">{p.beneficiario?.numero_documento ? `${p.beneficiario.tipo_documento ?? ''} ${p.beneficiario.numero_documento}` : ''}</span>
              </span>
            ),
          },
          { clave: 'convocatoria', titulo: 'Convocatoria', render: (p) => p.convocatoria?.nombre ?? p.convocatoria_id },
          { clave: 'tipo', titulo: 'Tramite', render: (p) => TEXTO_TIPO_SOLICITUD[p.tipo_solicitud] ?? p.tipo_solicitud },
          { clave: 'estado', titulo: 'Estado', render: (p) => <Badge tono="destacado">{p.estado}</Badge> },
          { clave: 'ciclo', titulo: 'Ciclo', render: (p) => p.ciclo, alineacion: 'centro' },
          { clave: 'enviada', titulo: 'Enviada', render: (p) => fechaCorta(p.enviada_en) },
          { clave: 'acciones', titulo: 'Acciones', render: (p) => <Link to={`/admin/postulaciones/${p.id}`}>Ver</Link> },
        ]}
        filas={data?.data ?? []}
        obtenerId={(p) => p.id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin postulaciones', descripcion: 'No hay registros para los filtros indicados.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: (page) => setFiltros({ ...filtros, page }) } : undefined}
      />
    </>
  );
}
