import { Alert, PageHeader, Spinner } from '../../../components/ui';
import { PermisosMatrixView } from '../components/PermisosMatrixView';
import { useMatrizPermisos } from '../hooks/useRolesPermisos';

export function MatrizPermisosPage() {
  const { data, isLoading, error } = useMatrizPermisos();

  return (
    <>
      <PageHeader
        titulo="Matriz de permisos por rol"
        descripcion="Vista de solo lectura. La matriz se modifica unicamente en el codigo (packages/shared) y en el seed de la base de datos, y aplica en la siguiente peticion sin reautenticar."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Seguridad' }, { etiqueta: 'Roles', ruta: '/admin/roles' }, { etiqueta: 'Matriz' }]}
      />
      {isLoading && <Spinner etiqueta="Cargando matriz" />}
      {error && <Alert tipo="error">{(error as Error).message}</Alert>}
      {data && <PermisosMatrixView matriz={data} />}
    </>
  );
}
