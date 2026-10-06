import { PageHeader } from '../../../components/ui';
import { EntregasTabla } from '../components/EntregasTabla';
import { OutboxPanel } from '../components/OutboxPanel';
import { SuprimidosPanel } from '../components/SuprimidosPanel';

/** /admin/notificaciones/entregas: bandeja de salida, entregas por destinatario y rebotes. */
export function EntregasCorreoPage() {
  return (
    <>
      <PageHeader
        titulo="Entregas de correo"
        descripcion="Estado del outbox de correo, reintentos manuales, entregas por destinatario y destinatarios suprimidos por rebote o queja."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Notificaciones', ruta: '/admin/notificaciones' }, { etiqueta: 'Entregas de correo' }]}
      />
      <div className="flex flex-col gap-6">
        <OutboxPanel />
        <SuprimidosPanel />
        <EntregasTabla />
      </div>
    </>
  );
}
