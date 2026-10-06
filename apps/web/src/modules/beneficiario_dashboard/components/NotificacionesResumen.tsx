import { Link } from 'react-router-dom';
import { Card } from '../../../components/ui';

/** Resumen breve del buzon en el panel principal; la logica vive en la campana y el centro de notificaciones. */
export function NotificacionesResumen({ noLeidas, criticas }: { noLeidas: number; criticas: number }) {
  return (
    <Card titulo="Notificaciones" data-testid="notificaciones-resumen">
      <p className="text-base">
        {noLeidas === 0 ? 'No tiene notificaciones sin leer.' : noLeidas === 1 ? 'Tiene 1 notificacion sin leer.' : `Tiene ${noLeidas} notificaciones sin leer.`}
        {criticas > 0 && ` ${criticas === 1 ? '1 es importante.' : `${criticas} son importantes.`}`}
      </p>
      <Link to="/beneficiario/notificaciones" className="mt-3 inline-flex min-h-[44px] items-center border border-ink px-4 text-base no-underline hover:bg-primary-10 hover:no-underline">
        Abrir centro de notificaciones
      </Link>
    </Card>
  );
}
