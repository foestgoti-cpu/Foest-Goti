import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Input, PageHeader, Select, Table } from '../../../components/ui';
import { useDependencias, useEstadoFuncionario, useFuncionarios } from '../hooks/useFuncionarios';
import { EstadoCuentaModal } from '../components/EstadoCuentaModal';
import { RestablecerClaveModal } from '../components/RestablecerClaveModal';
import { useAuth } from '../../../lib/auth/AuthProvider';
import type { FuncionarioCuenta } from '../types';

export function FuncionariosPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<'ACTIVO' | 'INACTIVO' | ''>('');
  const [dependencia, setDependencia] = useState('');
  const [objetivo, setObjetivo] = useState<FuncionarioCuenta | null>(null);
  const [objetivoClave, setObjetivoClave] = useState<FuncionarioCuenta | null>(null);
  const { permisos } = useAuth();
  const puedeRestablecer = permisos?.includes('funcionario:restablecer_clave') ?? true;
  const [mensaje, setMensaje] = useState<string | null>(null);

  const { data, isLoading, error } = useFuncionarios({ page, q: busqueda, estado, dependencia });
  const dependencias = useDependencias();
  const cambiarEstado = useEstadoFuncionario();

  const buscar = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setBusqueda(q.trim());
  };

  return (
    <>
      <PageHeader
        titulo="Funcionarios"
        descripcion="Cuentas de los funcionarios evaluadores. El alta se realiza por invitacion al correo institucional."
        acciones={<Button onClick={() => navigate('/admin/funcionarios/nuevo')}>Nuevo funcionario</Button>}
      />
      {mensaje && (
        <Alert tipo="exito" className="mb-4">
          {mensaje}
        </Alert>
      )}
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      <form onSubmit={buscar} className="mb-4 grid gap-3 border border-ink rounded-xl bg-primary-10 p-4 md:grid-cols-4" aria-label="Filtros de funcionarios">
        <Input placeholder="Buscar por nombre, correo o cargo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
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
        <Select
          aria-label="Dependencia"
          value={dependencia}
          onChange={(e) => {
            setDependencia(e.target.value);
            setPage(1);
          }}
          placeholder="Todas las dependencias"
          opciones={(dependencias.data?.data ?? []).map((d) => ({ valor: d, etiqueta: d }))}
        />
        <Button type="submit" variante="secundario">
          Buscar
        </Button>
      </form>
      <Table<FuncionarioCuenta>
        caption="Listado de funcionarios"
        columnas={[
          { clave: 'nombre', titulo: 'Nombre', render: (f) => <Link to={`/admin/funcionarios/${f.id}`}>{f.apellidos} {f.nombres}</Link> },
          { clave: 'email', titulo: 'Correo', render: (f) => f.email },
          { clave: 'cargo', titulo: 'Cargo', render: (f) => f.cargo ?? '-' },
          { clave: 'dependencia', titulo: 'Dependencia', render: (f) => f.dependencia ?? '-' },
          {
            clave: 'estado',
            titulo: 'Estado',
            render: (f) => (
              <span className="flex flex-wrap gap-1">
                <Badge tono={f.activo ? 'relleno' : 'neutro'}>{f.activo ? 'Activo' : 'Deshabilitado'}</Badge>
                {f.invitacion_pendiente && <Badge tono="destacado">Invitacion pendiente</Badge>}
              </span>
            ),
          },
          {
            clave: 'acciones',
            titulo: 'Acciones',
            render: (f) => (
              <span className="flex flex-wrap gap-1">
                <Button variante="texto" className="min-h-[36px] px-2 py-1 text-sm" onClick={() => setObjetivo(f)}>
                  {f.activo ? 'Deshabilitar' : 'Reactivar'}
                </Button>
                {f.activo && puedeRestablecer && (
                  <Button variante="texto" className="min-h-[36px] px-2 py-1 text-sm" onClick={() => setObjetivoClave(f)}>
                    Restablecer contrasena
                  </Button>
                )}
              </span>
            ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(f) => f.id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin funcionarios', descripcion: 'No hay funcionarios que coincidan con los filtros.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
      <EstadoCuentaModal
        abierto={Boolean(objetivo)}
        etiquetaCuenta={objetivo ? `${objetivo.nombres} ${objetivo.apellidos}` : ''}
        activar={objetivo ? !objetivo.activo : false}
        permiteForzar
        cargando={cambiarEstado.isPending}
        error={cambiarEstado.error}
        onCerrar={() => {
          setObjetivo(null);
          cambiarEstado.reset();
        }}
        onConfirmar={async (dto) => {
          if (!objetivo) return;
          try {
            await cambiarEstado.mutateAsync({ id: objetivo.id, dto });
            setMensaje(dto.activo ? 'La cuenta fue reactivada.' : 'La cuenta fue deshabilitada y sus sesiones revocadas.');
            setObjetivo(null);
            cambiarEstado.reset();
          } catch {
            // El error se muestra dentro del modal (incluido el 409 con expedientes pendientes).
          }
        }}
      />
      <RestablecerClaveModal
        abierto={Boolean(objetivoClave)}
        funcionarioId={objetivoClave?.id ?? null}
        etiquetaCuenta={objetivoClave ? `${objetivoClave.nombres} ${objetivoClave.apellidos}` : ''}
        onCerrar={() => setObjetivoClave(null)}
      />
    </>
  );
}
