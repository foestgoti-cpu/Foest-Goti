import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';

export function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Card titulo="403 - Acceso no autorizado">
        <p>Su rol no tiene permiso para acceder a esta seccion.</p>
        <p className="mt-3 text-sm">
          <Link to="/">Volver al inicio</Link>
        </p>
      </Card>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Card titulo="404 - Pagina no encontrada">
        <p>La direccion solicitada no existe o fue movida.</p>
        <p className="mt-3 text-sm">
          <Link to="/">Volver al inicio</Link>
        </p>
      </Card>
    </div>
  );
}

/** Placeholder para rutas de modulos aun no construidos. */
export function EnConstruccionPage({ modulo }: { modulo: string }) {
  return (
    <Card titulo={modulo}>
      <p>Modulo en construccion.</p>
    </Card>
  );
}
