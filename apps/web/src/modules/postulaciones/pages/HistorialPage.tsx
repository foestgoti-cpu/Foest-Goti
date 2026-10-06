import { Link, useParams } from 'react-router-dom';
import { Alert, Card, PageHeader, Spinner } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { HistorialTimeline } from '../components/HistorialTimeline';
import { useHistorial, usePostulacion } from '../hooks/usePostulaciones';

export function HistorialPage() {
  const { id } = useParams<{ id: string }>();
  const { data: postulacion } = usePostulacion(id);
  const { data, isLoading, error } = useHistorial(id);

  return (
    <>
      <PageHeader
        titulo="Historial de la postulacion"
        migas={[
          { etiqueta: 'Mis postulaciones', ruta: '/beneficiario/postulaciones' },
          { etiqueta: 'Detalle', ruta: `/beneficiario/postulaciones/${id}` },
          { etiqueta: 'Historial' },
        ]}
        descripcion={postulacion ? `${postulacion.convocatoria?.nombre ?? ''}. Estado actual: ${postulacion.estado_texto}.` : undefined}
      />
      {isLoading && <Spinner />}
      {error && (
        <Alert tipo="error">
          {error instanceof ApiRequestError && error.status === 404 ? 'La postulacion no existe o no le pertenece.' : (error as Error).message}{' '}
          <Link to="/beneficiario/postulaciones">Volver</Link>
        </Alert>
      )}
      {data && (
        <Card titulo="Movimientos">
          <HistorialTimeline items={data} />
        </Card>
      )}
    </>
  );
}
