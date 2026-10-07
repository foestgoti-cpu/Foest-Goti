import { Card, PageHeader } from '../../../components/ui';
import { SolicitarConsolidadoForm } from '../components/SolicitarConsolidadoForm';
import { TablaMisReportes } from '../components/TablaMisReportes';

/** Pagina compartida por administrador y funcionario; el alcance lo decide la API. */
export function ReportesPage() {
  return (
    <>
      <PageHeader
        titulo="Reportes"
        descripcion="Solicite consolidados por convocatoria y descargue los archivos generados. Los enlaces de descarga son temporales y cada exportacion queda auditada."
      />
      <div className="grid grid-cols-1 gap-6">
        <SolicitarConsolidadoForm />
        <Card titulo="Mis reportes" className="p-0">
          <div className="p-4">
            <TablaMisReportes />
          </div>
        </Card>
      </div>
    </>
  );
}
