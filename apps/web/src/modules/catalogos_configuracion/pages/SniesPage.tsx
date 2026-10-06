import { PageHeader } from '../../../components/ui';
import { SniesImportPanel } from '../components/SniesImportPanel';

export function SniesPage() {
  return (
    <>
      <PageHeader
        titulo="Catalogo SNIES"
        descripcion="Instituciones y programas de educacion superior del listado oficial del Ministerio de Educacion Nacional. El formulario de postulacion valida contra este catalogo."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Catalogo SNIES' }]}
      />
      <SniesImportPanel />
    </>
  );
}
