import { Link } from 'react-router-dom';
import { Alert, PageHeader } from '../../../components/ui';
import { useAlertasAdmin, useCargaEvaluadores, useConvocatoriasAdmin, useResumenAdmin } from '../hooks/useAdminDashboard';
import { GlobalKPISummary } from '../components/GlobalKPISummary';
import { AlertasOperativasPanel } from '../components/AlertasOperativasPanel';
import { ConvocatoriasStatusTracker } from '../components/ConvocatoriasStatusTracker';
import { CargaEvaluadoresChart } from '../components/CargaEvaluadoresChart';
import { ComparativaPeriodosCard } from '../components/ComparativaPeriodosCard';

export function AdminPanelPage() {
  const resumen = useResumenAdmin();
  const alertas = useAlertasAdmin();
  const convocatorias = useConvocatoriasAdmin();
  const habilitada = convocatorias.data?.convocatorias.find((c) => c.estado === 'HABILITADA');
  const carga = useCargaEvaluadores(habilitada?.periodo);
  const periodos = (convocatorias.data?.convocatorias ?? []).map((c) => c.periodo);

  return (
    <>
      <PageHeader
        titulo="Panel gerencial"
        descripcion="Monitoreo global del FOEST: totales, alertas operativas, estado de convocatorias y carga de evaluadores. Este panel es de solo lectura; las acciones se ejecutan en cada modulo."
        acciones={
          <nav aria-label="Accesos de administracion" className="flex flex-wrap gap-3 text-sm">
            <Link to="/admin/auditoria">Auditoria</Link>
            <Link to="/admin/configuracion">Configuracion</Link>
            <Link to="/admin/festivos">Festivos</Link>
          </nav>
        }
      />
      {resumen.error && <Alert tipo="error" className="mb-4">{(resumen.error as Error).message}</Alert>}
      <div className="grid grid-cols-1 gap-4">
        <GlobalKPISummary resumen={resumen.data} cargando={resumen.isLoading} />
        <AlertasOperativasPanel datos={alertas.data} cargando={alertas.isLoading} error={alertas.error as Error | null} />
        {convocatorias.error && <Alert tipo="error">{(convocatorias.error as Error).message}</Alert>}
        <ConvocatoriasStatusTracker convocatorias={convocatorias.data?.convocatorias ?? []} cargando={convocatorias.isLoading} />
        {carga.error && <Alert tipo="error">{(carga.error as Error).message}</Alert>}
        <CargaEvaluadoresChart evaluadores={carga.data?.evaluadores ?? []} cargando={carga.isLoading} periodo={carga.data?.periodo ?? null} />
        {convocatorias.data && <ComparativaPeriodosCard periodos={periodos} />}
      </div>
    </>
  );
}
