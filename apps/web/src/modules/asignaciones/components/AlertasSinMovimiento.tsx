import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Table } from '../../../components/ui';
import { fechaCorta } from '../../postulaciones/formato';
import type { AlertaAsignacionDto } from '@foest/shared';
import { useAlertas } from '../hooks/useAsignaciones';

/** Asignaciones sin movimiento, con enlace al detalle y accion de reasignar. */
export function AlertasSinMovimiento({ onReasignar }: { onReasignar: (a: AlertaAsignacionDto) => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAlertas(page);

  return (
    <>
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      <Table<AlertaAsignacionDto>
        caption="Asignaciones sin movimiento"
        columnas={[
          { clave: 'exp', titulo: 'Expediente', render: (a) => a.codigo_expediente },
          { clave: 'func', titulo: 'Evaluador', render: (a) => a.funcionario_nombre },
          { clave: 'asig', titulo: 'Asignada', render: (a) => fechaCorta(a.asignada_en) },
          { clave: 'mov', titulo: 'Ultimo movimiento', render: (a) => fechaCorta(a.ultimo_movimiento_en) },
          { clave: 'dias', titulo: 'Dias habiles sin movimiento', render: (a) => a.dias_habiles_sin_movimiento, alineacion: 'centro' },
          {
            clave: 'nota',
            titulo: 'Situacion',
            render: (a) => (
              <span className="flex flex-wrap gap-1">
                {!a.funcionario_activo && <Badge tono="relleno">Titular inactivo</Badge>}
                {!a.en_comite && <Badge tono="destacado">Fuera de comite</Badge>}
              </span>
            ),
          },
          {
            clave: 'acc',
            titulo: 'Acciones',
            render: (a) => (
              <span className="flex flex-wrap items-center gap-2">
                <Link to={`/admin/postulaciones/${a.postulacion_id}`}>Ver detalle</Link>
                <Button variante="secundario" onClick={() => onReasignar(a)}>
                  Reasignar
                </Button>
              </span>
            ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(a) => a.asignacion_id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin alertas', descripcion: 'No hay asignaciones sin movimiento por encima del umbral configurado.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
    </>
  );
}
