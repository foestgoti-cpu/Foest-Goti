import { PageHeader } from '../../../components/ui';
import { BuzonNotificaciones } from '../components/BuzonNotificaciones';
import { PreferenciasNotificaciones } from '../components/PreferenciasNotificaciones';

/** Centro de notificaciones del funcionario (/funcionario/notificaciones). */
export function NotificacionesFuncionarioPage() {
  return (
    <>
      <PageHeader titulo="Centro de notificaciones" descripcion="Avisos de comite, expedientes y plazos de las convocatorias donde participa." migas={[{ etiqueta: 'Inicio', ruta: '/funcionario' }, { etiqueta: 'Notificaciones' }]} />
      <div className="flex flex-col gap-6">
        <BuzonNotificaciones />
        <PreferenciasNotificaciones />
      </div>
    </>
  );
}

/** Centro de notificaciones del administrador (/admin/notificaciones) con acceso a las entregas de correo. */
export function NotificacionesAdminPage() {
  return (
    <>
      <PageHeader
        titulo="Centro de notificaciones"
        descripcion="Avisos del sistema, alertas de la cola de correo y recordatorios. La bandeja de salida y los rebotes se gestionan en Entregas de correo."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Notificaciones' }]}
      />
      <div className="flex flex-col gap-6">
        <BuzonNotificaciones />
        <PreferenciasNotificaciones />
      </div>
    </>
  );
}
