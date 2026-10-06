import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, PageHeader } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { FiltrosConvocatoriaBar } from '../components/FiltrosConvocatoriaBar';
import { FuncionarioKPIGrid } from '../components/FuncionarioKPIGrid';
import { GraficoDistribucionBeneficios } from '../components/GraficoDistribucionBeneficios';
import { GraficoTipoSolicitud } from '../components/GraficoTipoSolicitud';
import { GraficoTendenciaTemporal } from '../components/GraficoTendenciaTemporal';
import { MetricasTiemposRevision } from '../components/MetricasTiemposRevision';
import { CargaComiteChart } from '../components/CargaComiteChart';
import { SelloActualizacion } from '../components/SelloActualizacion';
import {
  useCargaComite,
  useConvocatoriasComite,
  usePorBeneficio,
  usePorTipoSolicitud,
  useResumenFuncionario,
  useSerieTemporal,
  useTiemposRevision,
} from '../hooks/useFuncionarioDashboard';
import type { FiltrosDashboard } from '../types';

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filtrosDesdeQuery(q: URLSearchParams): FiltrosDashboard {
  const convocatoria_id = q.get('convocatoria_id') ?? undefined;
  const desde = q.get('desde') ?? undefined;
  const hasta = q.get('hasta') ?? undefined;
  return {
    convocatoria_id: convocatoria_id && RE_UUID.test(convocatoria_id) ? convocatoria_id : undefined,
    desde: desde && RE_FECHA.test(desde) ? desde : undefined,
    hasta: hasta && RE_FECHA.test(hasta) ? hasta : undefined,
  };
}

function mensajeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 404) return 'La convocatoria seleccionada no pertenece a su comite. Seleccione otra convocatoria.';
    if (error.status === 403) return 'Su rol no tiene permiso para consultar este panel.';
    if (error.status === 422) return 'Los filtros no son validos. Revise las fechas seleccionadas.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'No fue posible cargar el panel.';
}

/**
 * Panel del funcionario (/funcionario): consola analitica de solo lectura sobre las
 * convocatorias de su comite. Sin exportacion (export_reports es el unico mecanismo).
 */
export function FuncionarioDashboardPage() {
  const [query, setQuery] = useSearchParams();
  const filtros = useMemo(() => filtrosDesdeQuery(query), [query]);
  const rangoInvalido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);
  // Con rango invalido se congela la consulta (se mantiene el ultimo render) hasta corregirlo.
  const filtrosConsulta = useMemo<FiltrosDashboard>(
    () => (rangoInvalido ? { convocatoria_id: filtros.convocatoria_id } : filtros),
    [filtros, rangoInvalido],
  );

  const cambiarFiltros = useCallback(
    (nuevos: FiltrosDashboard) => {
      const q = new URLSearchParams();
      if (nuevos.convocatoria_id) q.set('convocatoria_id', nuevos.convocatoria_id);
      if (nuevos.desde) q.set('desde', nuevos.desde);
      if (nuevos.hasta) q.set('hasta', nuevos.hasta);
      setQuery(q, { replace: true });
    },
    [setQuery],
  );

  const convocatorias = useConvocatoriasComite();
  const resumen = useResumenFuncionario(filtrosConsulta);
  const beneficios = usePorBeneficio(filtrosConsulta);
  const tipos = usePorTipoSolicitud(filtrosConsulta);
  const serie = useSerieTemporal(filtrosConsulta);
  const tiempos = useTiemposRevision(filtrosConsulta);
  const carga = useCargaComite(filtrosConsulta);

  const errorPrincipal = resumen.error ?? beneficios.error ?? tipos.error ?? serie.error ?? tiempos.error ?? carga.error ?? null;
  const sinComite = resumen.data && resumen.data.convocatorias.length === 0 && !filtros.convocatoria_id;

  return (
    <>
      <PageHeader
        titulo="Panel de metricas del comite"
        descripcion="Avance de las convocatorias donde usted integra el comite evaluador. Las cifras son agregadas y protegen la identidad de los postulantes."
      />
      <FiltrosConvocatoriaBar
        filtros={filtros}
        convocatorias={convocatorias.data?.items ?? []}
        cargandoConvocatorias={convocatorias.isLoading}
        onCambiar={cambiarFiltros}
      />
      <SelloActualizacion actualizadoEn={resumen.data?.datos_actualizados_en} className="mb-4 text-sm text-ink/80" />

      {errorPrincipal && (
        <Alert tipo="error" className="mb-4">
          {mensajeError(errorPrincipal)}
        </Alert>
      )}
      {sinComite && !errorPrincipal && (
        <Alert tipo="info" titulo="Sin convocatorias asignadas" className="mb-4">
          Usted no integra actualmente el comite de ninguna convocatoria. Cuando la Administracion lo asigne, este panel mostrara sus metricas.
        </Alert>
      )}

      <FuncionarioKPIGrid totales={resumen.data?.totales} filtros={filtros} cargando={resumen.isLoading} atenuado={resumen.isFetching && !resumen.isLoading} />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <GraficoDistribucionBeneficios datos={beneficios.data} cargando={beneficios.isLoading} atenuado={beneficios.isFetching && !beneficios.isLoading} />
        <GraficoTipoSolicitud datos={tipos.data} cargando={tipos.isLoading} atenuado={tipos.isFetching && !tipos.isLoading} />
      </div>

      <div className="mb-6">
        <GraficoTendenciaTemporal datos={serie.data} cargando={serie.isLoading} atenuado={serie.isFetching && !serie.isLoading} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <MetricasTiemposRevision datos={tiempos.data} cargando={tiempos.isLoading} atenuado={tiempos.isFetching && !tiempos.isLoading} />
        <CargaComiteChart datos={carga.data} cargando={carga.isLoading} atenuado={carga.isFetching && !carga.isLoading} />
      </div>

      <p className="text-xs text-ink/70">
        Para exportar un consolidado de la convocatoria utilice la opcion de reportes (modulo de exportacion); este panel no genera archivos.
      </p>
    </>
  );
}
