import { useState } from 'react';
import type { ReporteDto } from '@foest/shared';
import { Alert, Button, Table } from '../../../components/ui';
import { formatearFechaHora } from '../../convocatorias/utils';
import { usePermissions } from '../../roles_permissions';
import { useDescargarReporte, useMisReportes } from '../hooks/useReportes';
import { TEXTO_TIPO_REPORTE } from '../types';
import { formatearBytes, mensajeReporte } from '../utils';
import { EstadoReporteBadge } from './EstadoReporteBadge';

export function TablaMisReportes() {
  const { can } = usePermissions();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useMisReportes({ page, page_size: 20 });
  const descargar = useDescargarReporte();
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const pedir = async (r: ReporteDto) => {
    setAviso(null);
    try {
      const d = await descargar.mutateAsync(r.id);
      const a = document.createElement('a');
      a.href = d.url;
      a.download = d.nombre_archivo;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setAviso({ tipo: 'info', texto: `Descarga iniciada: ${d.nombre_archivo}. El enlace es temporal y caduca en 2 minutos.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeReporte(e) });
    }
  };

  return (
    <>
      {error && (
        <Alert tipo="error" className="mb-4">
          {mensajeReporte(error)}
        </Alert>
      )}
      {aviso && (
        <Alert tipo={aviso.tipo} className="mb-4">
          {aviso.texto}
        </Alert>
      )}
      <Table<ReporteDto>
        caption="Mis reportes"
        columnas={[
          {
            clave: 'tipo',
            titulo: 'Reporte',
            render: (r) => (
              <span>
                {TEXTO_TIPO_REPORTE[r.tipo]}
                <br />
                <span className="text-sm text-ink/70">{r.convocatoria_nombre ?? '-'}</span>
              </span>
            ),
          },
          {
            clave: 'estado',
            titulo: 'Estado',
            render: (r) => (
              <span>
                <EstadoReporteBadge estado={r.estado} />
                {r.estado === 'FALLIDO' && r.error && <span className="mt-1 block text-sm">{r.error}</span>}
              </span>
            ),
          },
          { clave: 'tamano', titulo: 'Tamano', alineacion: 'derecha', render: (r) => formatearBytes(r.tamano_bytes) },
          { clave: 'creado', titulo: 'Solicitado', render: (r) => formatearFechaHora(r.creado_en) },
          { clave: 'expira', titulo: 'Vence', render: (r) => formatearFechaHora(r.expira_en) },
          {
            clave: 'accion',
            titulo: 'Descarga',
            render: (r) =>
              r.estado === 'LISTO' && can('reportes:descargar') ? (
                <Button
                  variante="secundario"
                  className="min-h-[36px] px-3 py-1 text-sm"
                  cargando={descargar.isPending && descargar.variables === r.id}
                  onClick={() => void pedir(r)}
                >
                  Descargar
                </Button>
              ) : (
                '-'
              ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(r) => r.id}
        cargando={isLoading}
        vacio={{ titulo: 'Aun no ha solicitado reportes' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
    </>
  );
}
