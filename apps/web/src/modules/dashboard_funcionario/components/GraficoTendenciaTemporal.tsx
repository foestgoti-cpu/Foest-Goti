import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, EmptyState } from '../../../components/ui';
import type { PuntoSerie, RespuestaSerie } from '../types';
import { AREA_10, AZUL, FUENTE_EJE, REJILLA, SUPERFICIE } from './paleta';
import { formatoEntero, TooltipGrafico } from './TooltipGrafico';

const FORMATO_DIA = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const FORMATO_DIA_LARGO = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function etiquetaDia(dia: string, larga = false): string {
  const d = new Date(`${dia}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dia;
  return (larga ? FORMATO_DIA_LARGO : FORMATO_DIA).format(d);
}

export interface GraficoTendenciaTemporalProps {
  datos: RespuestaSerie | undefined;
  cargando?: boolean;
  atenuado?: boolean;
}

/**
 * Serie temporal de envios por dia (una serie: linea de 2 px con lavado de area al 10 %,
 * marcadores con anillo blanco, crosshair + tooltip, rejilla hairline). Sin leyenda (una
 * sola serie: el titulo la nombra). Vista de tabla gemela.
 */
export function GraficoTendenciaTemporal({ datos, cargando, atenuado }: GraficoTendenciaTemporalProps) {
  const [verTabla, setVerTabla] = useState(false);
  const items = datos?.items ?? [];
  const sinDatos = !cargando && (!datos || items.length === 0);
  const maximo = useMemo(() => items.reduce((m, p) => (p.total > m.total ? p : m), items[0] ?? { dia: '', total: 0 }), [items]);
  const totalPeriodo = items.reduce((acc, p) => acc + p.total, 0);
  const mostrarPuntos = items.length <= 45;

  return (
    <Card
      titulo="Envios por dia"
      acciones={
        items.length > 0 ? (
          <Button variante="texto" className="min-h-[36px] px-2 py-1 text-sm" aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
            {verTabla ? 'Ver grafico' : 'Ver tabla'}
          </Button>
        ) : undefined
      }
      className={`transition-opacity ${atenuado ? 'opacity-60' : ''}`}
    >
      <p className="mb-3 text-sm text-ink/80">
        Postulaciones distintas enviadas cada dia (incluye reenvios por subsanacion). Rango inclusivo. Total del periodo:{' '}
        <span className="font-semibold tabular-nums">{formatoEntero.format(totalPeriodo)}</span>
        {items.length > 0 && maximo.total > 0 && (
          <>
            {' '}
            · Dia con mas envios: <span className="font-semibold">{etiquetaDia(maximo.dia)}</span> ({formatoEntero.format(maximo.total)})
          </>
        )}
        .
      </p>
      {sinDatos && <EmptyState titulo="Sin envios en el periodo" descripcion="No hay postulaciones enviadas en el rango seleccionado." />}
      {cargando && !datos && <p className="text-sm">Cargando serie...</p>}
      {items.length > 0 && verTabla && (
        <div className="max-h-80 overflow-auto border border-ink">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Envios por dia</caption>
            <thead className="sticky top-0 bg-primary-10">
              <tr>
                <th scope="col" className="border-b border-ink px-3 py-2 font-semibold">
                  Dia
                </th>
                <th scope="col" className="border-b border-ink px-3 py-2 text-right font-semibold">
                  Envios
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.dia} className="border-b border-ink/30 last:border-b-0">
                  <td className="px-3 py-1.5">{p.dia}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatoEntero.format(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length > 0 && !verTabla && (
        <div className="h-72 min-h-[288px]" role="img" aria-label={`Linea de envios por dia, ${items.length} dias`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={items} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid vertical={false} stroke={REJILLA} strokeDasharray="0" />
              <XAxis
                dataKey="dia"
                tick={FUENTE_EJE}
                axisLine={{ stroke: REJILLA }}
                tickLine={false}
                tickFormatter={(v: string) => etiquetaDia(v)}
                minTickGap={24}
              />
              <YAxis allowDecimals={false} tick={FUENTE_EJE} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => formatoEntero.format(v)} />
              <Tooltip
                cursor={{ stroke: 'rgba(0, 0, 0, 0.35)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const p = payload[0]?.payload as PuntoSerie | undefined;
                  if (!p) return null;
                  return <TooltipGrafico titulo={etiquetaDia(p.dia, true)} filas={[{ nombre: 'envios', valor: formatoEntero.format(p.total), color: AZUL }]} />;
                }}
              />
              <Area type="monotone" dataKey="total" fill={AREA_10} stroke="none" isAnimationActive={false} activeDot={false} />
              <Line
                type="monotone"
                dataKey="total"
                name="Envios"
                stroke={AZUL}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                dot={mostrarPuntos ? { r: 4, fill: AZUL, stroke: SUPERFICIE, strokeWidth: 2 } : false}
                activeDot={{ r: 6, fill: AZUL, stroke: SUPERFICIE, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
