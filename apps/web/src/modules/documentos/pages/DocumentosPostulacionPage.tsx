import { Link, useParams } from 'react-router-dom';
import { Alert, Card, PageHeader, Spinner } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { usePostulacion } from '../../postulaciones/hooks/usePostulaciones';
import { PasoDocumentos } from '../components/PasoDocumentos';

/** `/beneficiario/postulaciones/:id/documentos`: soportes de la postulacion. */
export function DocumentosPostulacionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: postulacion, isLoading, error } = usePostulacion(id);

  if (!id) return <Alert tipo="error">Postulacion no indicada.</Alert>;
  if (isLoading) return <Spinner />;
  if (error || !postulacion) {
    return (
      <Alert tipo="error">
        {error instanceof ApiRequestError && error.status === 404 ? 'La postulacion no existe o no le pertenece.' : ((error as Error | null)?.message ?? 'No fue posible cargar la postulacion.')}{' '}
        <Link to="/beneficiario/postulaciones">Volver</Link>
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Documentos de soporte"
        descripcion={`Postulacion: ${postulacion.convocatoria?.nombre ?? 'Convocatoria'}`}
        migas={[
          { etiqueta: 'Mis postulaciones', ruta: '/beneficiario/postulaciones' },
          { etiqueta: 'Detalle', ruta: `/beneficiario/postulaciones/${id}` },
          { etiqueta: 'Documentos' },
        ]}
      />
      <Card titulo="Soportes de la postulacion">
        <PasoDocumentos postulacionId={id} />
      </Card>
    </>
  );
}
