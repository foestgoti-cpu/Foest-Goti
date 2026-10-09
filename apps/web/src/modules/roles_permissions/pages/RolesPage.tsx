import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, PageHeader, Spinner, Table } from '../../../components/ui';
import { usePermisosDeRol, useRoles } from '../hooks/useRolesPermisos';
import { ETIQUETA_ALCANCE, ETIQUETA_ROL, tituloCategoria, type PermisoItem, type RolItem } from '../types';

export function RolesPage() {
  const { data, isLoading, error } = useRoles();
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const detalle = usePermisosDeRol(seleccionado);

  return (
    <>
      <PageHeader
        titulo="Roles del sistema"
        descripcion="Los tres roles base son inmutables. Los permisos de cada rol se resuelven en el servidor desde la matriz oficial; no se editan desde la interfaz."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Seguridad' }, { etiqueta: 'Roles' }]}
        acciones={
          <Link to="/admin/roles/matriz" className="inline-flex min-h-[44px] items-center border border-ink rounded-lg bg-white px-4 py-2 text-base font-medium no-underline hover:bg-primary-10">
            Ver matriz de permisos
          </Link>
        }
      />
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      <Table<RolItem>
        caption="Roles del sistema"
        columnas={[
          { clave: 'nombre', titulo: 'Rol', render: (r) => <span className="font-semibold">{ETIQUETA_ROL[r.nombre]}</span> },
          { clave: 'codigo', titulo: 'Codigo', render: (r) => <code className="font-mono text-sm">{r.nombre}</code> },
          { clave: 'descripcion', titulo: 'Descripcion', render: (r) => r.descripcion },
          { clave: 'total', titulo: 'Permisos', alineacion: 'derecha', render: (r) => r.total_permisos },
          {
            clave: 'acciones',
            titulo: 'Detalle',
            render: (r) => (
              <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={() => setSeleccionado(r.id)} aria-pressed={seleccionado === r.id}>
                Ver permisos
              </Button>
            ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(r) => r.id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin roles', descripcion: 'La API no devolvio roles.' }}
      />

      {seleccionado && (
        <Card className="mt-6" titulo={`Permisos del rol ${ETIQUETA_ROL[seleccionado as RolItem['nombre']] ?? seleccionado}`}>
          {detalle.isLoading && <Spinner etiqueta="Cargando permisos" />}
          {detalle.error && <Alert tipo="error">{(detalle.error as Error).message}</Alert>}
          {detalle.data && <ListaPermisos permisos={detalle.data.permisos} />}
        </Card>
      )}
    </>
  );
}

function ListaPermisos({ permisos }: { permisos: PermisoItem[] }) {
  const categorias = [...new Set(permisos.map((p) => p.categoria))];
  if (permisos.length === 0) return <p>Este rol no tiene permisos concedidos.</p>;
  return (
    <div className="space-y-4">
      {categorias.map((c) => (
        <div key={c}>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide">{tituloCategoria(c)}</h3>
          <ul className="divide-y divide-ink/30 border border-ink rounded-xl overflow-hidden">
            {permisos
              .filter((p) => p.categoria === c)
              .map((p) => (
                <li key={p.codigo} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <code className="font-mono">{p.codigo}</code>
                    {p.descripcion && <span className="ml-2 text-ink/80">{p.descripcion}</span>}
                  </span>
                  <span className="text-xs uppercase tracking-wide">Alcance: {ETIQUETA_ALCANCE[p.alcance]}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
