import { PageHeader } from '../../../components/ui';
import { ConfiguracionTable } from '../components/ConfiguracionTable';

export function ConfiguracionPage() {
  return (
    <>
      <PageHeader
        titulo="Configuracion del sistema"
        descripcion="Parametros editables por categoria. Cada cambio exige confirmacion explicita, se valida contra el tipo y el rango de la clave y queda auditado. Si otro administrador modifico la clave mientras usted la editaba, se le pedira recargar."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Configuracion' }]}
      />
      <ConfiguracionTable />
    </>
  );
}
