import { useState } from 'react';
import { Alert, Badge, Button, PageHeader, Table } from '../../../components/ui';
import { useAuth } from '../../../lib/auth/AuthProvider';
import { useAdministradores, useEstadoAdministrador } from '../hooks/useAdministradores';
import { EstadoCuentaModal } from '../components/EstadoCuentaModal';
import type { AdministradorCuenta } from '../types';

export function AdministradoresPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [objetivo, setObjetivo] = useState<AdministradorCuenta | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const { data, isLoading, error } = useAdministradores(page);
  const cambiarEstado = useEstadoAdministrador();

  return (
    <>
      <PageHeader
        titulo="Administradores"
        descripcion="Cuentas con rol de administrador. No es posible deshabilitar la propia cuenta ni al unico administrador activo. El primer administrador se crea con el script de semilla."
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
      <Table<AdministradorCuenta>
        caption="Listado de administradores"
        columnas={[
          { clave: 'email', titulo: 'Correo', render: (a) => <span>{a.email}{a.id === user?.id ? ' (usted)' : ''}</span> },
          { clave: 'estado', titulo: 'Estado', render: (a) => <Badge tono={a.activo ? 'relleno' : 'neutro'}>{a.activo ? 'Activo' : 'Deshabilitado'}</Badge> },
          { clave: 'ultimo_login', titulo: 'Ultimo acceso', render: (a) => (a.ultimo_login ? new Date(a.ultimo_login).toLocaleString('es-CO') : '-') },
          { clave: 'creado_en', titulo: 'Creado', render: (a) => new Date(a.creado_en).toLocaleDateString('es-CO') },
          {
            clave: 'acciones',
            titulo: 'Acciones',
            render: (a) => (
              <Button variante="texto" className="min-h-[36px] px-2 py-1 text-sm" onClick={() => setObjetivo(a)} disabled={a.id === user?.id && a.activo}>
                {a.activo ? 'Deshabilitar' : 'Reactivar'}
              </Button>
            ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(a) => a.id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin administradores' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
      <EstadoCuentaModal
        abierto={Boolean(objetivo)}
        etiquetaCuenta={objetivo?.email ?? ''}
        activar={objetivo ? !objetivo.activo : false}
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
            setMensaje(dto.activo ? 'La cuenta fue reactivada.' : 'La cuenta fue deshabilitada.');
            setObjetivo(null);
            cambiarEstado.reset();
          } catch {
            // se muestra en el modal (ULTIMO_ADMINISTRADOR / AUTODESHABILITACION_NO_PERMITIDA)
          }
        }}
      />
    </>
  );
}
