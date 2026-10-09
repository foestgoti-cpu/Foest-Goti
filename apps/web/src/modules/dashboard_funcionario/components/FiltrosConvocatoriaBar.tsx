import { Button, Input, Select } from '../../../components/ui';
import type { ConvocatoriaComite, FiltrosDashboard } from '../types';

export const RUTA_BANDEJA_EVALUACION = '/funcionario/evaluacion';

function hoyLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export interface FiltrosConvocatoriaBarProps {
  filtros: FiltrosDashboard;
  convocatorias: ConvocatoriaComite[];
  cargandoConvocatorias?: boolean;
  onCambiar: (nuevos: FiltrosDashboard) => void;
}

/**
 * Barra de filtros: una sola fila, encima de todo lo que acota (convocatoria, rango de fechas
 * con atajos). Rango inclusivo en ambos extremos.
 */
export function FiltrosConvocatoriaBar({ filtros, convocatorias, cargandoConvocatorias, onCambiar }: FiltrosConvocatoriaBarProps) {
  const rangoInvalido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);

  const aplicarPreset = (dias: number | null) => {
    if (dias === null) {
      onCambiar({ ...filtros, desde: undefined, hasta: undefined });
      return;
    }
    const hasta = hoyLocal();
    onCambiar({ ...filtros, desde: restarDias(hasta, dias - 1), hasta });
  };

  const presetActivo = (dias: number | null): boolean => {
    if (dias === null) return !filtros.desde && !filtros.hasta;
    const hasta = hoyLocal();
    return filtros.hasta === hasta && filtros.desde === restarDias(hasta, dias - 1);
  };

  return (
    <form
      className="mb-6 border border-ink rounded-xl bg-white px-4 py-3"
      aria-label="Filtros del panel"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="filtro-convocatoria" className="mb-1 block text-sm font-semibold">
            Convocatoria
          </label>
          <Select
            id="filtro-convocatoria"
            name="convocatoria_id"
            placeholder={cargandoConvocatorias ? 'Cargando convocatorias...' : 'Todas las convocatorias de mi comite'}
            opciones={convocatorias.map((c) => ({ valor: c.id, etiqueta: `${c.anio}-${c.semestre} · ${c.nombre}` }))}
            value={filtros.convocatoria_id ?? ''}
            disabled={cargandoConvocatorias}
            onChange={(e) => onCambiar({ ...filtros, convocatoria_id: e.target.value || undefined })}
          />
        </div>
        <div>
          <label htmlFor="filtro-desde" className="mb-1 block text-sm font-semibold">
            Desde
          </label>
          <Input
            id="filtro-desde"
            name="desde"
            type="date"
            value={filtros.desde ?? ''}
            max={filtros.hasta}
            invalido={rangoInvalido}
            onChange={(e) => onCambiar({ ...filtros, desde: e.target.value || undefined })}
          />
        </div>
        <div>
          <label htmlFor="filtro-hasta" className="mb-1 block text-sm font-semibold">
            Hasta
          </label>
          <Input
            id="filtro-hasta"
            name="hasta"
            type="date"
            value={filtros.hasta ?? ''}
            min={filtros.desde}
            invalido={rangoInvalido}
            onChange={(e) => onCambiar({ ...filtros, hasta: e.target.value || undefined })}
          />
        </div>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-1 text-sm font-semibold">Atajos de periodo</legend>
          {(
            [
              [7, 'Ultimos 7 dias'],
              [30, 'Ultimos 30 dias'],
              [90, 'Ultimos 90 dias'],
              [null, 'Todo el periodo'],
            ] as Array<[number | null, string]>
          ).map(([dias, etiqueta]) => (
            <Button
              key={etiqueta}
              type="button"
              variante={presetActivo(dias) ? 'primario' : 'secundario'}
              className="min-h-[36px] px-3 py-1 text-sm"
              aria-pressed={presetActivo(dias)}
              onClick={() => aplicarPreset(dias)}
            >
              {etiqueta}
            </Button>
          ))}
        </fieldset>
      </div>
      {rangoInvalido && (
        <p role="alert" className="mt-2 border-l-2 border-danger pl-2 text-sm font-medium text-danger">
          La fecha inicial no puede ser posterior a la fecha final. Corrija el rango para actualizar el panel.
        </p>
      )}
    </form>
  );
}
