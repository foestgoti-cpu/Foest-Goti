import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, PageHeader, Spinner } from '../../../components/ui';
import { useAuth } from '../../../lib/auth/AuthProvider';
import { ConvocatoriaCard } from '../components/ConvocatoriaCard';
import { usePublica } from '../hooks/useConvocatorias';
import { codigoDeError } from '../utils';

/** Detalle publico (`/convocatorias/:id`): solo convocatorias HABILITADA vigentes. */
export function ConvocatoriaPublicaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const { data, isLoading, error } = usePublica(id);

  return (
    <div>
      <PageHeader titulo="Detalle de la convocatoria" migas={[{ etiqueta: 'Inicio', ruta: '/' }, { etiqueta: 'Convocatoria' }]} />
      {isLoading && <Spinner etiqueta="Consultando convocatoria" />}
      {error && (
        <Card>
          <Alert tipo={codigoDeError(error) === 'NO_ENCONTRADO' ? 'info' : 'error'}>
            {codigoDeError(error) === 'NO_ENCONTRADO'
              ? 'La convocatoria no existe o no se encuentra abierta en este momento.'
              : 'No fue posible consultar la convocatoria. Intente de nuevo mas tarde.'}
          </Alert>
          <p className="mt-3 text-sm">
            <Link to="/">Volver al inicio</Link>
          </p>
        </Card>
      )}
      {data && (
        <div className="space-y-4">
          <ConvocatoriaCard convocatoria={data} detallada />
          <Card titulo="Como postularse">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Cree su cuenta o inicie sesion como beneficiario.</li>
              <li>Complete su perfil y seleccione los beneficios a los que desea aplicar.</li>
              <li>Cargue los soportes exigidos y envie su postulacion antes del cierre (23:59:59, hora de Colombia).</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-3">
              {session ? (
                <Link to="/beneficiario/postulaciones" className="no-underline hover:no-underline">
                  <Button>Ir a mis postulaciones</Button>
                </Link>
              ) : (
                <>
                  <Link to="/registro" className="no-underline hover:no-underline">
                    <Button>Crear cuenta</Button>
                  </Link>
                  <Link to="/login" className="no-underline hover:no-underline">
                    <Button variante="secundario">Iniciar sesion</Button>
                  </Link>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
