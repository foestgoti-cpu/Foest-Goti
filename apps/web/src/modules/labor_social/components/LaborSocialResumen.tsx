import { Badge } from '../../../components/ui';
import { horas } from '../formato';
import { TEXTO_ESTADO_CERTIFICADO } from '../types';

/** Forma mínima que necesita el componente (compatible con ResumenLaborSocialDto y LaborSocialResumenDto de evaluación). */
export interface ResumenMinimo {
  total_horas_acumuladas: number;
  horas_minimas_requeridas: number | null;
  estado: string | null;
  semestre_academico?: string | null;
}

/** Resumen de solo lectura de labor social (expediente del evaluador, ficha del beneficiario). Sin detalle de actividades. */
export function LaborSocialResumen({ resumen, titulo = 'Labor social' }: { resumen: ResumenMinimo | null | undefined; titulo?: string }) {
  if (!resumen) {
    return (
      <div className="text-sm">
        <p className="font-semibold">{titulo}</p>
        <p>Sin certificado de labor social registrado.</p>
      </div>
    );
  }
  const minimas = resumen.horas_minimas_requeridas;
  const cumple = minimas != null ? resumen.total_horas_acumuladas >= minimas && resumen.total_horas_acumuladas > 0 : null;
  const estado = resumen.estado ? ((TEXTO_ESTADO_CERTIFICADO as Record<string, string>)[resumen.estado] ?? resumen.estado) : null;
  return (
    <div className="text-sm">
      <p className="font-semibold">{titulo}</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {resumen.semestre_academico && (
          <>
            <dt className="font-semibold">Semestre</dt>
            <dd>{resumen.semestre_academico}</dd>
          </>
        )}
        <dt className="font-semibold">Horas acumuladas</dt>
        <dd>{horas(resumen.total_horas_acumuladas)}</dd>
        <dt className="font-semibold">Horas mínimas</dt>
        <dd>{minimas != null ? horas(minimas) : 'Sin definir'}</dd>
        <dt className="font-semibold">Estado</dt>
        <dd>{estado ? <Badge tono="destacado">{estado}</Badge> : '-'}</dd>
        {cumple !== null && (
          <>
            <dt className="font-semibold">Mínimo</dt>
            <dd>{cumple ? 'Cumplido' : 'No cumplido'}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
