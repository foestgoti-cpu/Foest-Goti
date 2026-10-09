import { Link } from 'react-router-dom';
import { Alert, Button, Card, EmptyState, Spinner } from '../../../components/ui';
import { ConvocatoriaCard } from '../components/ConvocatoriaCard';
import { usePublicas } from '../hooks/useConvocatorias';
import { formatearFechaLocal } from '../utils';

/** Listado publico (`/convocatorias`): convocatorias abiertas (sin sesion). El inicio de sesion vive en `/`. */
export function ConvocatoriasPublicasPage() {
  const { data, isLoading, error } = usePublicas();
  const abiertas = data?.data ?? [];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-primary-20 bg-primary-10 px-6 py-8">
        <h1 className="text-3xl">Convocatorias del Fondo para la Educación Superior</h1>
        <p className="mt-3 max-w-3xl text-base">
          Consulte las convocatorias abiertas del FOEST, en el marco del Acuerdo Municipal 023 de 2025, y cree su cuenta para postularse.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link to="/registro" className="no-underline hover:no-underline">
            <Button>Crear cuenta</Button>
          </Link>
          <Link to="/login">Volver al inicio de sesión</Link>
        </div>
      </section>

      <section aria-labelledby="convocatorias-abiertas">
        <h2 id="convocatorias-abiertas" className="mb-3">
          Convocatorias abiertas
        </h2>
        {isLoading && <Spinner etiqueta="Consultando convocatorias" />}
        {error && (
          <Alert tipo="error">No fue posible consultar las convocatorias en este momento. Intente de nuevo mas tarde.</Alert>
        )}
        {!isLoading && !error && abiertas.length === 0 && (
          <Card>
            <EmptyState
              titulo="No hay convocatorias abiertas en este momento"
              descripcion={
                data?.proxima_apertura_estimada
                  ? `Fecha estimada de la proxima apertura: ${formatearFechaLocal(data.proxima_apertura_estimada)}.`
                  : 'Cuando el FOEST habilite una convocatoria, aparecera en esta seccion con sus beneficios y fechas de cierre.'
              }
            />
          </Card>
        )}
        {abiertas.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {abiertas.map((c) => (
              <ConvocatoriaCard key={c.id} convocatoria={c} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card titulo="Beneficiarios">
          <p className="text-sm">Estudiantes de Tocancipa que presentan su solicitud, cargan soportes y siguen el estado de su expediente.</p>
        </Card>
        <Card titulo="Funcionarios">
          <p className="text-sm">Comite evaluador que revisa expedientes asignados y emite dictamen por beneficio.</p>
        </Card>
        <Card titulo="Administracion">
          <p className="text-sm">Gestion de convocatorias, cuentas, configuracion, auditoria y reportes del fondo.</p>
        </Card>
      </div>
    </div>
  );
}
