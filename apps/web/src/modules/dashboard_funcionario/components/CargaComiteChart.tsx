import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../../components/ui';
import type { RespuestaCarga } from '../types';
import { AZUL, FUENTE_EJE, ID_TRAMA_45, REJILLA } from './paleta';
import { MuestraLeyenda, Tramas } from './Tramas';
import { formatoDecimal, formatoEntero, TooltipGrafico } from './TooltipGrafico';

const RELLENO_PROPIA = { fill: AZUL, color: AZUL, tramado: false };
const RELLENO_COMITE = { fill: `url(#${ID_TRAMA_45}-0)`, color: AZUL, tramado: true };

interface FilaCarga {
  categoria: string;
  propia: number;
  comite: number | null;
}

function formatearValor(v: number): string {
  return Number.isInteger(v) ? formatoEntero.format(v) : formatoDecimal.format(v);
}

export interface CargaComiteChartProps {
  datos: RespuestaCarga | undefined;
  cargando?: boolean;
  atenuado?: boolean;
}

/**
 * Carga propia frente al promedio del comite (sin nombres de otros evaluadores). Dos series
 * del mismo azul diferenciadas por textura (solida vs tramada a 45 grados) con leyenda; si el
 * comite tiene menos de 3 miembros el promedio se omite y se explica el motivo.
 */
export function CargaComiteChart({ datos, cargando, atenuado }: CargaComiteChartProps) {
  const filas: FilaCarga[] = datos
    ? [
        { categoria: 'Asignaciones activas', propia: datos.propia.activas, comite: datos.promedio_comite?.activas ?? null },
        { categoria: 'Dictaminadas en el periodo', propia: datos.propia.dictaminadas_periodo, comite: datos.promedio_comite?.dictaminadas_periodo ?? null },
      ]
    : [];
  const conPromedio = Boolean(datos?.promedio_comite);

  return (
    <Card titulo="Mi carga frente al comite" className={`transition-opacity ${atenuado ? 'opacity-60' : ''}`}>
      <p className="mb-3 text-sm text-ink/80">
        Expedientes con asignacion activa a su nombre y dictamenes emitidos en el periodo, comparados con el promedio por integrante del comite
        {datos ? ` (${formatoEntero.format(datos.miembros_comite)} ${datos.miembros_comite === 1 ? 'integrante' : 'integrantes'})` : ''}. No se muestran datos de otros evaluadores.
      </p>
      {cargando && !datos && <p className="text-sm">Cargando carga...</p>}
      {datos && !conPromedio && (
        <p className="mb-3 border-l-2 border-ink pl-2 text-sm" role="status">
          El promedio del comite se publica cuando el comite tiene al menos 3 integrantes, para no permitir deducir la carga de otro evaluador.
        </p>
      )}
      {datos && (
        <>
          <ul className="mb-2 flex flex-wrap gap-4 text-sm" aria-label="Leyenda">
            <li className="flex items-center gap-2">
              <MuestraLeyenda {...RELLENO_PROPIA} /> Mi carga
            </li>
            {conPromedio && (
              <li className="flex items-center gap-2">
                <MuestraLeyenda {...RELLENO_COMITE} /> Promedio del comite
              </li>
            )}
          </ul>
          <div className="h-56 min-h-[224px]" role="img" aria-label="Barras de carga propia y promedio del comite">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filas} margin={{ top: 16, right: 8, bottom: 4, left: 0 }} barCategoryGap={28} barGap={2}>
                <Tramas />
                <CartesianGrid vertical={false} stroke={REJILLA} strokeDasharray="0" />
                <XAxis dataKey="categoria" tick={FUENTE_EJE} axisLine={{ stroke: REJILLA }} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={FUENTE_EJE} axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  cursor={{ fill: 'rgba(35, 141, 193, 0.10)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0]?.payload as FilaCarga | undefined;
                    if (!p) return null;
                    const filasTooltip = [{ nombre: 'mi carga', valor: formatearValor(p.propia), color: AZUL }];
                    if (p.comite !== null) filasTooltip.push({ nombre: 'promedio del comite', valor: formatearValor(p.comite), color: AZUL });
                    return <TooltipGrafico titulo={String(label)} filas={filasTooltip} />;
                  }}
                />
                <Bar dataKey="propia" name="Mi carga" fill={RELLENO_PROPIA.fill} barSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="propia" position="top" fill="#000000" fontSize={12} formatter={(v: number) => formatearValor(v)} />
                </Bar>
                {conPromedio && (
                  <Bar dataKey="comite" name="Promedio del comite" fill={RELLENO_COMITE.fill} barSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey="comite" position="top" fill="#000000" fontSize={12} formatter={(v: number) => formatearValor(v)} />
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Carga propia y promedio del comite</caption>
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                <th scope="col">Mi carga</th>
                <th scope="col">Promedio del comite</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.categoria}>
                  <td>{f.categoria}</td>
                  <td>{formatearValor(f.propia)}</td>
                  <td>{f.comite === null ? 'No publicado' : formatearValor(f.comite)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
