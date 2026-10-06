import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Button, Card, EmptyState } from '../../../components/ui';
import type { ItemDistribucion, RespuestaDistribucion } from '../types';
import { rellenoSerie, SUPERFICIE } from './paleta';
import { MuestraLeyenda, Tramas } from './Tramas';
import { TablaDistribucion } from './TablaDistribucion';
import { formatoEntero, TooltipGrafico } from './TooltipGrafico';

const MAX_SEGMENTOS = 6;
const ETIQUETA_RESTO = 'Otras lineas';

/** Reduce a MAX_SEGMENTOS: las de menor conteo (visibles) se pliegan en "Otras lineas" solo para la dona. */
export function plegarParaDona(items: ItemDistribucion[]): ItemDistribucion[] {
  if (items.length <= MAX_SEGMENTOS) return items;
  const agrupado = items.find((i) => i.agrupado);
  const visibles = items.filter((i) => !i.agrupado);
  const cupo = MAX_SEGMENTOS - 1 - (agrupado ? 1 : 0);
  const top = visibles.slice(0, cupo);
  const resto = visibles.slice(cupo);
  const restoTotal = resto.reduce((acc, i) => acc + i.total, 0);
  const salida: ItemDistribucion[] = [...top];
  if (restoTotal > 0) salida.push({ clave: '__resto', etiqueta: `${ETIQUETA_RESTO} (${resto.length})`, total: restoTotal, agrupado: false });
  if (agrupado) salida.push(agrupado);
  return salida;
}

export interface GraficoDistribucionBeneficiosProps {
  datos: RespuestaDistribucion | undefined;
  cargando?: boolean;
  atenuado?: boolean;
}

/**
 * Dona por beneficio (part-to-whole, <= 6 segmentos). Identidad por escalon de claridad y
 * trama (no por color solo), leyenda siempre presente, etiquetas directas selectivas (los
 * dos mayores) y vista de tabla gemela. Las celdas menores al umbral llegan ya agrupadas
 * como "Otros / Casos aislados" desde la API.
 */
export function GraficoDistribucionBeneficios({ datos, cargando, atenuado }: GraficoDistribucionBeneficiosProps) {
  const [verTabla, setVerTabla] = useState(false);
  const segmentos = useMemo(() => plegarParaDona(datos?.items ?? []), [datos]);
  const total = segmentos.reduce((acc, s) => acc + s.total, 0);
  const sinDatos = !cargando && (!datos || datos.items.length === 0);

  return (
    <Card
      titulo="Distribucion por beneficio"
      acciones={
        datos && datos.items.length > 0 ? (
          <Button variante="texto" className="min-h-[36px] px-2 py-1 text-sm" aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
            {verTabla ? 'Ver grafico' : 'Ver tabla'}
          </Button>
        ) : undefined
      }
      className={`transition-opacity ${atenuado ? 'opacity-60' : ''}`}
    >
      <p className="mb-3 text-sm text-ink/80">
        Postulaciones distintas que solicitan cada beneficio. Una postulacion con varios beneficios cuenta en cada uno, por lo que la suma puede superar el total del comite.
      </p>
      {datos?.suprimido && (
        <p className="border-l-2 border-ink pl-2 text-sm" role="status">
          El total del periodo es menor al umbral de privacidad ({datos.umbral} casos): no se publica el desglose.
        </p>
      )}
      {sinDatos && !datos?.suprimido && <EmptyState titulo="Sin postulaciones en el periodo" descripcion="Ajuste los filtros o espere nuevos envios." />}
      {cargando && !datos && <p className="text-sm">Cargando distribucion...</p>}
      {datos && datos.items.length > 0 && verTabla && (
        <TablaDistribucion items={datos.items} caption="Postulaciones por beneficio" etiquetaClave="Beneficio" />
      )}
      {datos && datos.items.length > 0 && !verTabla && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="h-64 min-h-[256px]" role="img" aria-label={`Dona de distribucion por beneficio, ${segmentos.length} segmentos`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tramas />
                <Pie
                  data={segmentos}
                  dataKey="total"
                  nameKey="etiqueta"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={1.5}
                  stroke={SUPERFICIE}
                  strokeWidth={2}
                  isAnimationActive={false}
                  labelLine={false}
                  label={(p: { index?: number; percent?: number; x?: number; y?: number; textAnchor?: string }) => {
                    const i = p.index ?? 0;
                    if (i > 1 || (p.percent ?? 0) < 0.08) return null;
                    return (
                      <text x={p.x} y={p.y} textAnchor={p.textAnchor as 'start' | 'end' | 'middle'} dominantBaseline="central" fontSize={12} fill="#000000">
                        {`${Math.round((p.percent ?? 0) * 100)} %`}
                      </text>
                    );
                  }}
                >
                  {segmentos.map((s, i) => (
                    <Cell key={s.clave} fill={rellenoSerie(i).fill} />
                  ))}
                </Pie>
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0]?.payload as ItemDistribucion | undefined;
                    if (!p) return null;
                    const idx = segmentos.findIndex((s) => s.clave === p.clave);
                    return (
                      <TooltipGrafico
                        titulo={p.etiqueta}
                        filas={[
                          { nombre: 'postulaciones', valor: formatoEntero.format(p.total), color: rellenoSerie(Math.max(idx, 0)).color },
                          { nombre: 'del total publicado', valor: total > 0 ? `${((p.total / total) * 100).toFixed(1).replace('.', ',')} %` : '-' },
                        ]}
                      />
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1.5 self-center text-sm" aria-label="Leyenda">
            {segmentos.map((s, i) => {
              const r = rellenoSerie(i);
              return (
                <li key={s.clave} className="flex items-center gap-2">
                  <MuestraLeyenda fill={r.fill} tramado={r.tramado} color={r.color} />
                  <span className="min-w-0 flex-1 truncate">{s.etiqueta}</span>
                  <span className="tabular-nums font-semibold">{formatoEntero.format(s.total)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {datos && datos.celdas_agrupadas > 0 && !datos.suprimido && (
        <p className="mt-3 text-xs text-ink/70">
          {datos.celdas_agrupadas} {datos.celdas_agrupadas === 1 ? 'linea' : 'lineas'} con menos de {datos.umbral} casos se muestran agrupadas como "Otros / Casos aislados" para proteger la identidad de los postulantes.
        </p>
      )}
    </Card>
  );
}
