import { PageHeader } from '../../../components/ui';
import { AuditoriaLogViewer } from '../components/AuditoriaLogViewer';
import { IntegridadPanel } from '../components/IntegridadPanel';

/** /admin/auditoria: bitacora inmutable (solo ADMINISTRADOR; la API responde 403 a otros roles). */
export function AuditoriaPage() {
  return (
    <>
      <PageHeader
        titulo="Auditoria"
        descripcion="Bitacora inmutable de eventos de la plataforma. Las consultas por actor, la apertura de un detalle, la linea de tiempo de una entidad y las exportaciones quedan registradas como eventos de auditoria."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Auditoria' }]}
      />
      <IntegridadPanel />
      <AuditoriaLogViewer />
    </>
  );
}
