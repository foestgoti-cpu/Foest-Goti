import { Alert, PageHeader, Spinner } from '../../../components/ui';
import { useDescargas, useDocumentosPostulacion, useLineaTiempo, useOtorgamientos, useResumenBeneficiario } from '../hooks/useBeneficiarioDashboard';
import { EstudianteResumenCard } from '../components/EstudianteResumenCard';
import { AccionesPendientesAlert } from '../components/AccionesPendientesAlert';
import { LineaTiempoExpediente } from '../components/LineaTiempoExpediente';
import { DocumentChecklistStatus } from '../components/DocumentChecklistStatus';
import { DescargasOficialesCard } from '../components/DescargasOficialesCard';
import { OtorgamientosCard } from '../components/OtorgamientosCard';
import { NotificacionesResumen } from '../components/NotificacionesResumen';

/** Panel principal del beneficiario (mobile-first: una columna; dos columnas desde lg). */
export function BeneficiarioHomePage() {
  const resumen = useResumenBeneficiario();
  const postulacionId = resumen.data?.postulacion_actual?.id ?? null;
  const lineaTiempo = useLineaTiempo(postulacionId);
  const documentos = useDocumentosPostulacion(postulacionId);
  const descargas = useDescargas();
  const otorgamientos = useOtorgamientos(Boolean(resumen.data));

  return (
    <>
      <PageHeader titulo="Mi portal" descripcion="Consulte la convocatoria vigente, el estado de su postulacion y las acciones que tiene pendientes." />

      {resumen.isLoading && (
        <div className="py-6">
          <Spinner etiqueta="Cargando su informacion" />
        </div>
      )}
      {resumen.error && <Alert tipo="error">No fue posible cargar su portal: {(resumen.error as Error).message}</Alert>}

      {resumen.data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <EstudianteResumenCard resumen={resumen.data} />
            <AccionesPendientesAlert acciones={resumen.data.acciones_pendientes} />
            <LineaTiempoExpediente
              datos={postulacionId ? lineaTiempo.data : undefined}
              cargando={Boolean(postulacionId) && lineaTiempo.isLoading}
              error={(lineaTiempo.error as Error | null) ?? null}
            />
          </div>
          <div className="space-y-4">
            <NotificacionesResumen noLeidas={resumen.data.notificaciones.no_leidas} criticas={resumen.data.notificaciones.criticas_no_leidas} />
            <DocumentChecklistStatus
              datos={postulacionId ? documentos.data : undefined}
              cargando={Boolean(postulacionId) && documentos.isLoading}
              error={(documentos.error as Error | null) ?? null}
            />
            <DescargasOficialesCard datos={descargas.data} cargando={descargas.isLoading} error={(descargas.error as Error | null) ?? null} />
            <OtorgamientosCard datos={otorgamientos.data} cargando={otorgamientos.isLoading} error={(otorgamientos.error as Error | null) ?? null} />
          </div>
        </div>
      )}
    </>
  );
}
