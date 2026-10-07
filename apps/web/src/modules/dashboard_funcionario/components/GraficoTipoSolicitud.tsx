import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, EmptyState } from '../../../components/ui';
import type { ItemDistribucion, RespuestaDistribucion } from '../types';
import { AZUL, FUENTE_EJE, REJILLA } from './paleta';
import { TablaDistribucion } from './TablaDistribucion';
import { formatoEntero, TooltipGrafico } from './TooltipGrafico';

export interface GraficoTipoSolicitudProps {
  datos: RespuestaDistribucion | undefined;
  cargando?: boolean;
  atenuado?: boolean;
}

/**
 * Barras horizontales por tipo de tramite (PRIMERA_VEZ, RENOVACION, REINTEGRO y, si aplica,
 * "Otros / Casos aislados"). Una sola serie: un solo color, sin leyenda; valor al extremo
 * de cada barra; rejilla de un pixel; vista de tabla gemela.
 */
export function GraficoTipoSolicitud({ datos, cargando, atenuado }: GraficoTipoSolicitudProps) {
  const [verTabla, setVerTabla] = useState(false);
  const items = datos?.items ?? [];
  const sinDatos = !cargando && (!datos || items.length === 0);
  const alto = Math.max(140, 40 + items.length * 44);

  return (
    <Card
      titulo="Distribucion por tipo de solicitud"
      acciones={
        items.length > 0 ? (
          <Button variante="texto" className="min-h-[36px] px-2 py-1 text-sm" aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
            {verTabla ? 'Ver grafico' : 'Ver tabla'}
          </Button>
        ) : undefined
      }
      className={`transition-opacity ${atenuado ? 'opacity-60' : ''}`}
    >
      <p className="mb-3 text-sm text-ink/80">Postulaciones del ciclo vigente segun el tramite solicitado.</p>
      {datos?.suprimido && (
        <p className="border-l-2 border-ink pl-2 text-sm" role="status">
          El total del periodo es menor al umbral de privacidad ({datos.umbral} casos): no se publica el desglose.
        </p>
      )}
      {sinDatos && !datos?.suprimido && <EmptyState titulo="Sin postulaciones en el periodo" />}
      {cargando && !datos && <p className="text-sm">Cargando distribucion...</p>}
      {items.length > 0 && verTabla && <TablaDistribucion items={items} caption="Postulaciones por tipo de solicitud" etiquetaClave="Tipo de solicitud" />}
      {items.length > 0 && !verTabla && (
        <div style={{ height: alto }} role="img" aria-label="Barras de postulaciones por tipo de solicitud">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={items} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap={12}>
              <CartesianGrid horizontal={false} stroke={REJILLA} strokeDasharray="0" />
              <XAxis type="number" allowDecimals={false} tick={FUENTE_EJE} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatoEntero.format(Number(v))} />
              <YAxis type="category" dataKey="etiqueta" width={150} tick={FUENTE_EJE} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(35, 141, 193, 0.10)' }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const p = payload[0]?.payload as ItemDistribucion | undefined;
                  if (!p) return null;
                  return <TooltipGrafico titulo={p.etiqueta} filas={[{ nombre: 'postulaciones', valor: formatoEntero.format(p.total), color: AZUL }]} />;
                }}
              />
              <Bar dataKey="total" name="Postulaciones" fill={AZUL} barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="total" position="right" fill="#000000" fontSize={12} formatter={(v: unknown) => formatoEntero.format(Number(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {datos && datos.celdas_agrupadas > 0 && !datos.suprimido && (
        <p className="mt-3 text-xs text-ink/70">
          Los tipos con menos de {datos.umbral} casos se agrupan como "Otros / Casos aislados".
        </p>
      )}
    </Card>
  );
}
