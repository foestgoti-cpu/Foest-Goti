import type { FormEvent } from 'react';
import { Button, Card, Input, Select } from '../../../components/ui';
import { ETIQUETA_RESULTADO, FILTROS_VACIOS, type AuditoriaFiltros as Filtros, type CatalogoAuditoria, type FiltrosFormulario } from '../types';

/**
 * Formulario de filtros del visor: actor, entidad, identificador, accion, resultado,
 * request_id y rango de fechas (America/Bogota, cierre inclusivo; maximo 366 dias).
 */
export function limpiarFiltros(borrador: FiltrosFormulario): Filtros {
  const limpio: Filtros = {};
  for (const [k, v] of Object.entries(borrador)) {
    const valor = v.trim();
    if (valor !== '') (limpio as Record<string, string>)[k] = valor;
  }
  return limpio;
}

export interface AuditoriaFiltrosProps {
  catalogo?: CatalogoAuditoria;
  borrador: FiltrosFormulario;
  onCambiar: (borrador: FiltrosFormulario) => void;
  onAplicar: (filtros: Filtros) => void;
  onLimpiar: () => void;
}

export function AuditoriaFiltros({ catalogo, borrador, onCambiar, onAplicar, onLimpiar }: AuditoriaFiltrosProps) {
  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    onAplicar(limpiarFiltros(borrador));
  };
  const campo = (k: keyof FiltrosFormulario) => ({
    id: `filtro-${k}`,
    value: borrador[k],
    onChange: (e: { target: { value: string } }) => onCambiar({ ...borrador, [k]: e.target.value }),
  });
  const opciones = (lista?: readonly string[], etiquetas?: Record<string, string>) => (lista ?? []).map((v) => ({ valor: v, etiqueta: etiquetas?.[v] ?? v }));

  return (
    <Card titulo="Filtros" className="mb-4">
      <form onSubmit={aplicar} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="text-sm">
          <label htmlFor="filtro-entidad" className="mb-1 block font-semibold">
            Entidad
          </label>
          <Select opciones={opciones(catalogo?.entidades)} placeholder="Todas" {...campo('entidad')} />
        </div>
        <div className="text-sm">
          <label htmlFor="filtro-accion" className="mb-1 block font-semibold">
            Accion
          </label>
          <Select opciones={opciones(catalogo?.acciones)} placeholder="Todas" {...campo('accion')} />
        </div>
        <div className="text-sm">
          <label htmlFor="filtro-resultado" className="mb-1 block font-semibold">
            Resultado
          </label>
          <Select opciones={opciones(catalogo?.resultados, ETIQUETA_RESULTADO)} placeholder="Todos" {...campo('resultado')} />
        </div>
        <div className="text-sm">
          <label htmlFor="filtro-entidad_id" className="mb-1 block font-semibold">
            Identificador de entidad
          </label>
          <Input {...campo('entidad_id')} autoComplete="off" maxLength={200} />
        </div>
        <div className="text-sm">
          <label htmlFor="filtro-actor_id" className="mb-1 block font-semibold">
            Actor (uuid)
          </label>
          <Input {...campo('actor_id')} autoComplete="off" placeholder="La consulta por actor queda auditada" />
        </div>
        <div className="text-sm">
          <label htmlFor="filtro-request_id" className="mb-1 block font-semibold">
            Request id
          </label>
          <Input {...campo('request_id')} autoComplete="off" maxLength={200} />
        </div>
        <div className="text-sm">
          <label htmlFor="filtro-desde" className="mb-1 block font-semibold">
            Desde
          </label>
          <Input type="date" {...campo('desde')} />
        </div>
        <div className="text-sm">
          <label htmlFor="filtro-hasta" className="mb-1 block font-semibold">
            Hasta
          </label>
          <Input type="date" {...campo('hasta')} />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Consultar</Button>
          <Button
            type="button"
            variante="secundario"
            onClick={() => {
              onCambiar({ ...FILTROS_VACIOS });
              onLimpiar();
            }}
          >
            Limpiar
          </Button>
          <p className="text-xs text-ink/70">Rango maximo de 366 dias por consulta. Fechas en hora de Colombia.</p>
        </div>
      </form>
    </Card>
  );
}
