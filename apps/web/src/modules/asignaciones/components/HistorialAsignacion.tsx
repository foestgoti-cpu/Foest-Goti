import { Alert, Spinner } from '../../../components/ui';
import { fechaLarga } from '../../postulaciones/formato';
import { useHistorialAsignacion } from '../hooks/useAsignaciones';
import { TEXTO_EVENTO_HISTORIAL, TEXTO_MOTIVO_LIBERACION } from '../types';

/**
 * Historial de asignaciones, liberaciones y conflictos de un expediente (solo administrador).
 * Para incrustar en el detalle: `<HistorialAsignacion postulacionId={id} />`.
 */
export function HistorialAsignacion({ postulacionId }: { postulacionId: string }) {
  const { data, isLoading, error } = useHistorialAsignacion(postulacionId);

  if (isLoading) return <Spinner />;
  if (error) return <Alert tipo="error">{(error as Error).message}</Alert>;
  if (!data || data.length === 0) return <p className="text-sm">Este expediente no registra asignaciones.</p>;

  return (
    <ol className="border-l-2 border-primary pl-4">
      {data.map((h) => (
        <li key={h.id} className="relative mb-5 last:mb-0">
          <span aria-hidden="true" className="absolute -left-[21px] top-1 h-3 w-3 border border-primary bg-white" />
          <p className="text-sm text-ink/70">{fechaLarga(h.ocurrido_en)}</p>
          <p className="font-semibold">
            {TEXTO_EVENTO_HISTORIAL[h.evento] ?? h.evento}
            {h.funcionario_nombre ? ` - ${h.funcionario_nombre}` : ''}
          </p>
          <p className="text-sm">
            {h.ciclo !== null ? `Ciclo ${h.ciclo}. ` : ''}
            {h.motivo_liberacion ? `Motivo: ${TEXTO_MOTIVO_LIBERACION[h.motivo_liberacion] ?? h.motivo_liberacion}.` : ''}
          </p>
          {h.motivo && <p className="mt-1 border-l-2 border-ink pl-2 text-sm">{h.motivo}</p>}
        </li>
      ))}
    </ol>
  );
}
