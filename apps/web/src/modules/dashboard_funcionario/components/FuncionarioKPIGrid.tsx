import { Link } from 'react-router-dom';
import type { FiltrosDashboard, TotalesResumen } from '../types';
import { RUTA_BANDEJA_EVALUACION } from './FiltrosConvocatoriaBar';
import { formatoEntero } from './TooltipGrafico';

export interface TarjetaKPI {
  clave: keyof TotalesResumen;
  etiqueta: string;
  /** Filtro `estado` que se precarga en la bandeja de evaluacion (sin estado = todas). */
  estado?: string;
  descripcion: string;
}

export const TARJETAS_KPI: TarjetaKPI[] = [
  { clave: 'asignadas', etiqueta: 'Postulaciones del comite', descripcion: 'Total de postulaciones enviadas en el alcance y periodo seleccionados.' },
  { clave: 'pendientes', etiqueta: 'Pendientes', estado: 'PENDIENTE', descripcion: 'Esperan ser tomadas por un evaluador.' },
  { clave: 'en_evaluacion', etiqueta: 'En evaluacion', estado: 'EN_EVALUACION', descripcion: 'Con asignacion activa en curso.' },
  { clave: 'en_correccion', etiqueta: 'En correccion', estado: 'EN_CORRECCION', descripcion: 'Devueltas al beneficiario para subsanar.' },
  { clave: 'aprobadas', etiqueta: 'Aprobadas', estado: 'APROBADA', descripcion: 'Con al menos un beneficio aprobado.' },
  { clave: 'rechazadas', etiqueta: 'Rechazadas', estado: 'RECHAZADA', descripcion: 'Dictamen con todos los beneficios rechazados o vencimiento de subsanacion.' },
  { clave: 'desistidas', etiqueta: 'Desistidas', estado: 'DESISTIDA', descripcion: 'Retiradas por el beneficiario.' },
];

/** Construye el enlace a la bandeja de evaluacion con los filtros precargados en la query. */
export function enlaceBandeja(filtros: FiltrosDashboard, estado?: string): string {
  const q = new URLSearchParams();
  if (estado) q.set('estado', estado);
  if (filtros.convocatoria_id) q.set('convocatoria_id', filtros.convocatoria_id);
  if (filtros.desde) q.set('desde', filtros.desde);
  if (filtros.hasta) q.set('hasta', filtros.hasta);
  const cadena = q.toString();
  return cadena ? `${RUTA_BANDEJA_EVALUACION}?${cadena}` : RUTA_BANDEJA_EVALUACION;
}

export interface FuncionarioKPIGridProps {
  totales: TotalesResumen | undefined;
  filtros: FiltrosDashboard;
  cargando?: boolean;
  atenuado?: boolean;
}

/**
 * Fila de indicadores: la cifra principal (postulaciones del comite) como figura
 * destacada y seis tarjetas por estado, cada una enlazada a la bandeja de evaluacion.
 * Los totales por estado suman exactamente la cifra principal (no se aplica k-anonimato).
 */
export function FuncionarioKPIGrid({ totales, filtros, cargando, atenuado }: FuncionarioKPIGridProps) {
  const [principal, ...secundarias] = TARJETAS_KPI as [TarjetaKPI, ...TarjetaKPI[]];
  const valor = (clave: keyof TotalesResumen) => (totales ? formatoEntero.format(totales[clave]) : cargando ? '...' : '0');

  return (
    <section aria-label="Indicadores por estado" className={`mb-6 transition-opacity ${atenuado ? 'opacity-60' : ''}`}>
      <div className="grid gap-3 md:grid-cols-4">
        <Link
          to={enlaceBandeja(filtros)}
          className="block border border-ink bg-primary-10 px-4 py-4 text-ink no-underline hover:bg-primary-20 hover:no-underline md:row-span-2"
          aria-label={`${principal.etiqueta}: ${valor(principal.clave)}. Abrir bandeja de evaluacion`}
        >
          <p className="text-sm font-semibold">{principal.etiqueta}</p>
          <p className="mt-2 text-5xl font-semibold leading-none" data-testid="kpi-asignadas">
            {valor(principal.clave)}
          </p>
          <p className="mt-3 text-sm text-ink/80">{principal.descripcion}</p>
          <p className="mt-3 text-sm font-medium text-primary">Ver bandeja de evaluacion</p>
        </Link>
        {secundarias.map((t) => (
          <Link
            key={t.clave}
            to={enlaceBandeja(filtros, t.estado)}
            className="block border border-ink bg-white px-4 py-3 text-ink no-underline hover:bg-primary-10 hover:no-underline"
            aria-label={`${t.etiqueta}: ${valor(t.clave)}. Abrir bandeja de evaluacion filtrada`}
          >
            <p className="text-sm font-semibold">{t.etiqueta}</p>
            <p className="mt-1 text-3xl font-semibold leading-none" data-testid={`kpi-${t.clave}`}>
              {valor(t.clave)}
            </p>
            <p className="mt-2 text-xs text-ink/70">{t.descripcion}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
