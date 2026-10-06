import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, PageHeader, Table } from '../../../components/ui';
import { usePostulacionesPropias } from '../hooks/usePostulaciones';
import { cierrePresentado, fechaCorta, TEXTO_TIPO_SOLICITUD } from '../formato';
import type { Postulacion } from '../types';

export function PostulacionesListaPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = usePostulacionesPropias(page);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        titulo="Mis postulaciones"
        descripcion="Consulte el estado de sus solicitudes al FOEST y continue los borradores pendientes."
        acciones={<Button onClick={() => navigate('/beneficiario/postulaciones/nueva')}>Nueva postulacion</Button>}
      />
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      <Table<Postulacion>
        caption="Postulaciones propias"
        columnas={[
          { clave: 'convocatoria', titulo: 'Convocatoria', render: (p) => p.convocatoria?.nombre ?? p.convocatoria_id },
          { clave: 'tipo', titulo: 'Tramite', render: (p) => TEXTO_TIPO_SOLICITUD[p.tipo_solicitud] ?? p.tipo_solicitud },
          {
            clave: 'estado',
            titulo: 'Estado',
            render: (p) => <Badge tono={p.estado === 'BORRADOR' ? 'neutro' : p.estado === 'EN_CORRECCION' ? 'relleno' : 'destacado'}>{p.estado_texto}</Badge>,
          },
          {
            clave: 'fechas',
            titulo: 'Fechas',
            render: (p) => (
              <span className="text-sm">
                {p.estado === 'BORRADOR' && <>Cierre: {cierrePresentado(p.convocatoria?.fecha_cierre_exclusiva)}</>}
                {p.estado === 'EN_CORRECCION' && <>Plazo de correccion: {fechaCorta(p.fecha_limite_subsanacion)}</>}
                {p.estado !== 'BORRADOR' && p.estado !== 'EN_CORRECCION' && <>Enviada: {fechaCorta(p.enviada_en)}</>}
              </span>
            ),
          },
          {
            clave: 'acciones',
            titulo: 'Acciones',
            render: (p) => (
              <span className="flex flex-wrap gap-3 text-sm">
                <Link to={`/beneficiario/postulaciones/${p.id}`}>{p.estado === 'BORRADOR' ? 'Continuar' : p.estado === 'EN_CORRECCION' ? 'Corregir' : 'Ver'}</Link>
                <Link to={`/beneficiario/postulaciones/${p.id}/historial`}>Historial</Link>
              </span>
            ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(p) => p.id}
        cargando={isLoading}
        vacio={{ titulo: 'Aun no tiene postulaciones', descripcion: 'Cuando haya una convocatoria abierta podra iniciar su solicitud desde Nueva postulacion.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
    </>
  );
}
