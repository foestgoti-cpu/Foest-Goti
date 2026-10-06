import { PageHeader } from '../../../components/ui';
import { AuditoriaLogViewer } from '../components/AuditoriaLogViewer';

export function AuditoriaPage() {
  return (
    <>
      <PageHeader
        titulo="Auditoria"
        descripcion="Bitacora inmutable de eventos de la plataforma. Las consultas por actor y la apertura de un detalle quedan registradas como lectura sensible."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Auditoria' }]}
      />
      <AuditoriaLogViewer />
    </>
  );
}
