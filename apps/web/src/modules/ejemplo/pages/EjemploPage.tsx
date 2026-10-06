import { useState } from 'react';
import { PageHeader, Table, Alert, Badge } from '../../../components/ui';
import { useBeneficios } from '../hooks/useBeneficios';
import type { BeneficioItem } from '../types';

export function EjemploPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useBeneficios(page);

  return (
    <>
      <PageHeader titulo="Ejemplo: catalogo de beneficios" descripcion="Pagina de referencia para los modulos (tabla paginada + TanStack Query + API)." />
      {error && <Alert tipo="error" className="mb-4">{(error as Error).message}</Alert>}
      <Table<BeneficioItem>
        caption="Catalogo de beneficios"
        columnas={[
          { clave: 'codigo', titulo: 'Codigo', render: (b) => <span className="font-mono">{b.codigo}</span> },
          { clave: 'nombre', titulo: 'Nombre', render: (b) => b.nombre },
          { clave: 'categoria', titulo: 'Categoria', render: (b) => <Badge tono="destacado">{b.categoria}</Badge> },
          { clave: 'activo', titulo: 'Estado', render: (b) => (b.activo ? 'Activo' : 'Inactivo') },
        ]}
        filas={data?.data ?? []}
        obtenerId={(b) => b.codigo}
        cargando={isLoading}
        vacio={{ titulo: 'Sin beneficios', descripcion: 'La API no devolvio registros.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
    </>
  );
}
