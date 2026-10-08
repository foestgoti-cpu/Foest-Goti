import { useId, useState } from 'react';
import { Card, Table } from '../../../components/ui';
import type { CargaEvaluador } from '../types';
import { numero } from './formato';

/**
 * Carga nominal por evaluador: barras horizontales agrupadas (dos series) + tabla.
 * Especificacion dataviz adaptada a la paleta estricta: una sola rampa (azul
 * institucional); la segunda serie se distingue por textura (trama a 45 grados)
 * ademas del tinte, con leyenda siempre presente y etiquetas directas en la punta.
 * Barras de 12 px, separacion de 2 px, extremo redondeado de 4 px, base cuadrada.
 */
const ALTO_BARRA = 12;
const GAP = 2;
const ALTO_FILA = 44;
const ANCHO = 640;
const MARGEN_IZQ = 180;
const MARGEN_DER = 56;

function Barra({ x, y, w, h, clase, fill, etiqueta }: { x: number; y: number; w: number; h: number; clase?: string; fill?: string; etiqueta: string }) {
  const r = Math.min(4, w);
  // Base cuadrada a la izquierda, extremo redondeado a la derecha
  const d = w <= 0 ? '' : `M${x},${y} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${y + h - r} a${r},${r} 0 0 1 -${r},${r} H${x} Z`;
  return (
    <>
      {d && <path d={d} className={clase} fill={fill} />}
      <text x={x + w + 6} y={y + h / 2} dominantBaseline="middle" className="fill-ink text-[11px] tabular-nums">
        {etiqueta}
      </text>
    </>
  );
}

export function CargaEvaluadoresChart({ evaluadores, cargando, periodo }: { evaluadores: CargaEvaluador[]; cargando: boolean; periodo: string | null }) {
  const patronId = useId();
  const [vista, setVista] = useState<'grafico' | 'tabla'>('grafico');
  const [activo, setActivo] = useState<string | null>(null);
  const filas = [...evaluadores].sort((a, b) => b.en_evaluacion - a.en_evaluacion);
  const maximo = Math.max(1, ...filas.map((f) => Math.max(f.en_evaluacion, f.dictaminadas_periodo)));
  const anchoPlot = ANCHO - MARGEN_IZQ - MARGEN_DER;
  const escala = (v: number) => (v / maximo) * anchoPlot;
  const alto = filas.length * ALTO_FILA + 8;
  // Sin duplicados: con maximo = 1 la mitad redondeada coincide con el maximo (claves repetidas en React).
  const ticks = [...new Set([0, Math.ceil(maximo / 2), maximo])];

  return (
    <Card
      titulo="Carga por evaluador"
      acciones={
        <div className="flex gap-1" role="group" aria-label="Vista">
          <button type="button" className={`border px-2 py-1 text-xs ${vista === 'grafico' ? 'border-primary bg-primary text-white' : 'border-ink bg-white'}`} onClick={() => setVista('grafico')} aria-pressed={vista === 'grafico'}>
            Grafico
          </button>
          <button type="button" className={`border px-2 py-1 text-xs ${vista === 'tabla' ? 'border-primary bg-primary text-white' : 'border-ink bg-white'}`} onClick={() => setVista('tabla')} aria-pressed={vista === 'tabla'}>
            Tabla
          </button>
        </div>
      }
      pie={periodo ? `Dictamenes contados en el periodo ${periodo}. Vista nominal exclusiva del administrador.` : 'Dictamenes contados en todos los periodos. Vista nominal exclusiva del administrador.'}
    >
      {vista === 'grafico' && (
        <>
          <ul className="mb-2 flex flex-wrap gap-4 text-sm" aria-label="Leyenda">
            <li className="flex items-center gap-2">
              <span className="inline-block h-3 w-5 bg-primary" aria-hidden="true" />
              Expedientes en evaluacion
            </li>
            <li className="flex items-center gap-2">
              <svg width="20" height="12" aria-hidden="true">
                <rect width="20" height="12" fill={`url(#${patronId})`} />
              </svg>
              Dictaminadas en el periodo
            </li>
          </ul>
          {filas.length === 0 && !cargando && <p className="text-sm text-ink/80">No hay funcionarios registrados.</p>}
          {filas.length > 0 && (
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${ANCHO} ${alto + 20}`} width="100%" role="img" aria-label="Barras de carga por evaluador" className="max-w-full">
                <defs>
                  <pattern id={patronId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" className="fill-primary-20" />
                    <line x1="0" y1="0" x2="0" y2="6" className="stroke-primary" strokeWidth="2" />
                  </pattern>
                </defs>
                {ticks.map((t) => (
                  <g key={t}>
                    <line x1={MARGEN_IZQ + escala(t)} x2={MARGEN_IZQ + escala(t)} y1={0} y2={alto} className="stroke-ink/20" strokeWidth="1" />
                    <text x={MARGEN_IZQ + escala(t)} y={alto + 14} textAnchor="middle" className="fill-ink/70 text-[10px] tabular-nums">
                      {numero(t)}
                    </text>
                  </g>
                ))}
                {filas.map((f, i) => {
                  const y0 = i * ALTO_FILA + 4;
                  const resaltado = activo === f.funcionario_id;
                  return (
                    <g
                      key={f.funcionario_id}
                      onMouseEnter={() => setActivo(f.funcionario_id)}
                      onMouseLeave={() => setActivo(null)}
                      onFocus={() => setActivo(f.funcionario_id)}
                      onBlur={() => setActivo(null)}
                      tabIndex={0}
                      aria-label={`${f.nombre}: ${f.en_evaluacion} en evaluacion, ${f.dictaminadas_periodo} dictaminadas`}
                    >
                      <rect x={0} y={y0 - 4} width={ANCHO} height={ALTO_FILA} className={resaltado ? 'fill-primary-10' : 'fill-transparent'} />
                      <text x={MARGEN_IZQ - 8} y={y0 + ALTO_BARRA + GAP / 2 + 2} textAnchor="end" dominantBaseline="middle" className="fill-ink text-[12px]">
                        {f.nombre.length > 26 ? `${f.nombre.slice(0, 25)}…` : f.nombre}
                        {!f.activo ? ' (inactivo)' : ''}
                      </text>
                      <Barra x={MARGEN_IZQ} y={y0} w={escala(f.en_evaluacion)} h={ALTO_BARRA} clase="fill-primary" etiqueta={numero(f.en_evaluacion)} />
                      <Barra x={MARGEN_IZQ} y={y0 + ALTO_BARRA + GAP} w={escala(f.dictaminadas_periodo)} h={ALTO_BARRA} fill={`url(#${patronId})`} etiqueta={numero(f.dictaminadas_periodo)} />
                      <title>{`${f.nombre}: ${f.en_evaluacion} en evaluacion, ${f.dictaminadas_periodo} dictaminadas, ${f.pendientes_pool_del_comite} pendientes en su comite`}</title>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </>
      )}
      {vista === 'tabla' && (
        <Table<CargaEvaluador>
          caption="Carga nominal por evaluador"
          columnas={[
            { clave: 'nombre', titulo: 'Funcionario', render: (f) => `${f.nombre}${f.activo ? '' : ' (inactivo)'}` },
            { clave: 'en_evaluacion', titulo: 'En evaluacion', alineacion: 'derecha', render: (f) => numero(f.en_evaluacion) },
            { clave: 'dictaminadas', titulo: 'Dictaminadas', alineacion: 'derecha', render: (f) => numero(f.dictaminadas_periodo) },
            { clave: 'pool', titulo: 'Pendientes del comite', alineacion: 'derecha', render: (f) => numero(f.pendientes_pool_del_comite) },
            { clave: 'comites', titulo: 'Comites', alineacion: 'derecha', render: (f) => numero(f.comites_activos) },
          ]}
          filas={filas}
          obtenerId={(f) => f.funcionario_id}
          cargando={cargando}
          vacio={{ titulo: 'Sin funcionarios' }}
        />
      )}
    </Card>
  );
}
