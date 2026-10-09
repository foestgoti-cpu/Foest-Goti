import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Input, PageHeader, Select, Table } from '../../../components/ui';
import { useBeneficiarios } from '../hooks/useBeneficiarios';
import type { BeneficiarioCuenta } from '../types';

export function BeneficiariosPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<'ACTIVO' | 'INACTIVO' | ''>('');
  const { data, isLoading, error } = useBeneficiarios({ page, q: busqueda, estado });

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setBusqueda(q.trim());
  };

  return (
    <>
      <PageHeader titulo="Beneficiarios" descripcion="Busqueda de estudiantes registrados por documento, nombre o correo. La lectura de un perfil queda registrada en la auditoria." />
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      <form onSubmit={buscar} className="mb-4 grid gap-3 border border-ink rounded-xl bg-primary-10 p-4 md:grid-cols-3" aria-label="Filtros de beneficiarios">
        <Input placeholder="Documento, nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <Select
          aria-label="Estado"
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value as 'ACTIVO' | 'INACTIVO' | '');
            setPage(1);
          }}
          placeholder="Todos los estados"
          opciones={[
            { valor: 'ACTIVO', etiqueta: 'Activos' },
            { valor: 'INACTIVO', etiqueta: 'Deshabilitados' },
          ]}
        />
        <Button type="submit" variante="secundario">
          Buscar
        </Button>
      </form>
      <Table<BeneficiarioCuenta>
        caption="Listado de beneficiarios"
        columnas={[
          { clave: 'documento', titulo: 'Documento', render: (b) => <span className="font-mono">{b.tipo_documento ?? ''} {b.numero_documento ?? '-'}</span> },
          { clave: 'nombre', titulo: 'Nombre', render: (b) => <Link to={`/admin/beneficiarios/${b.id}`}>{[b.apellidos, b.nombres].filter(Boolean).join(' ') || '(sin nombre)'}</Link> },
          { clave: 'email', titulo: 'Correo', render: (b) => b.email },
          {
            clave: 'estado',
            titulo: 'Estado',
            render: (b) => (
              <span className="flex flex-wrap gap-1">
                <Badge tono={b.activo ? 'relleno' : 'neutro'}>{b.activo ? 'Activo' : 'Deshabilitado'}</Badge>
                {b.anonimizado && <Badge tono="neutro">Anonimizado</Badge>}
                {b.es_menor && <Badge tono="destacado">Menor de edad</Badge>}
                <Badge tono={b.perfil_completo ? 'destacado' : 'neutro'}>{b.perfil_completo ? 'Perfil completo' : 'Perfil incompleto'}</Badge>
              </span>
            ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(b) => b.id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin beneficiarios', descripcion: 'No hay beneficiarios que coincidan con la busqueda.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
    </>
  );
}
