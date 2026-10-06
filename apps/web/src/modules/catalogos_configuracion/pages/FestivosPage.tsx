import { PageHeader } from '../../../components/ui';
import { FestivosManager } from '../components/FestivosManager';

export function FestivosPage() {
  return (
    <>
      <PageHeader
        titulo="Festivos"
        descripcion="Calendario de festivos de Colombia usado para calcular dias habiles (plazos de subsanacion y alertas). Cargue cada anio antes de diciembre."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Festivos' }]}
      />
      <FestivosManager />
    </>
  );
}
