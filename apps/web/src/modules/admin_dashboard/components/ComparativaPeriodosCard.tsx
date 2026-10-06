import { useState } from 'react';
import { Alert, Button, Card, Select, Spinner } from '../../../components/ui';
import { useMetricasPeriodo } from '../hooks/useAdminDashboard';
import type { MetricasPeriodo } from '../types';
import { ETIQUETA_ESTADO_POSTULACION, etiqueta, moneda, numero } from './formato';

function Fila({ etiquetaFila, a, b }: { etiquetaFila: string; a: string; b: string }) {
  return (
    <tr className="border-b border-ink/30 last:border-b-0">
      <th scope="row" className="px-3 py-1.5 text-left font-normal">
        {etiquetaFila}
      </th>
      <td className="px-3 py-1.5 text-right tabular-nums">{a}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{b}</td>
    </tr>
  );
}

function Seccion({ titulo, a, b, claves, formato = numero }: { titulo: string; a?: Record<string, number>; b?: Record<string, number>; claves?: Record<string, string>; formato?: (n: number) => string }) {
  const todas = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort((x, y) => (x === 'OTROS' ? 1 : y === 'OTROS' ? -1 : x.localeCompare(y)));
  if (todas.length === 0) return null;
  return (
    <>
      <tr className="bg-primary-10">
        <th colSpan={3} className="px-3 py-1 text-left text-xs font-semibold uppercase tracking-wider">
          {titulo}
        </th>
      </tr>
      {todas.map((k) => (
        <Fila key={k} etiquetaFila={k === 'OTROS' ? 'Otros / casos aislados' : claves ? etiqueta(claves, k) : k} a={a?.[k] === undefined ? '—' : formato(a[k] as number)} b={b?.[k] === undefined ? '—' : formato(b[k] as number)} />
      ))}
    </>
  );
}

export function ComparativaPeriodosCard({ periodos }: { periodos: string[] }) {
  const [a, setA] = useState<string>(periodos[0] ?? '');
  const [b, setB] = useState<string>(periodos[1] ?? periodos[0] ?? '');
  const [consulta, setConsulta] = useState<{ a: string; b: string } | null>(periodos.length >= 2 ? { a: periodos[0] as string, b: periodos[1] as string } : null);
  const { data, isLoading, error } = useMetricasPeriodo(consulta?.a ?? null, consulta?.b ?? null);
  const opciones = periodos.map((p) => ({ valor: p, etiqueta: p }));

  const ma: MetricasPeriodo | undefined = data?.a;
  const mb: MetricasPeriodo | undefined = data?.b;
  const montos = (m?: MetricasPeriodo) => (m?.montos?.estado === 'disponible' ? m.montos : undefined);

  return (
    <Card titulo="Comparativa entre periodos" pie={data ? `Desgloses con k-anonimato (umbral ${data.kanon_umbral}): celdas menores se agrupan en "Otros".` : undefined}>
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (a && b) setConsulta({ a, b });
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Periodo A</span>
          <Select opciones={opciones} value={a} onChange={(e) => setA(e.target.value)} placeholder="Seleccione" className="min-w-[8rem]" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Periodo B</span>
          <Select opciones={opciones} value={b} onChange={(e) => setB(e.target.value)} placeholder="Seleccione" className="min-w-[8rem]" />
        </label>
        <Button type="submit" variante="secundario" disabled={!a || !b}>
          Comparar
        </Button>
      </form>
      {error && <Alert tipo="error">{(error as Error).message}</Alert>}
      {isLoading && <Spinner />}
      {periodos.length === 0 && <p className="text-sm text-ink/80">No hay convocatorias para comparar.</p>}
      {data && (
        <div className="overflow-x-auto border border-ink">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Comparativa de postulaciones y montos entre dos periodos</caption>
            <thead className="bg-primary-10">
              <tr>
                <th className="border-b border-ink px-3 py-2 text-left">Indicador</th>
                <th className="border-b border-ink px-3 py-2 text-right">{data.a.periodo}</th>
                <th className="border-b border-ink px-3 py-2 text-right">{data.b.periodo}</th>
              </tr>
            </thead>
            <tbody>
              <Fila etiquetaFila="Convocatoria" a={ma?.existe ? (ma.convocatoria?.nombre ?? '—') : 'No existe'} b={mb?.existe ? (mb.convocatoria?.nombre ?? '—') : 'No existe'} />
              <Fila etiquetaFila="Postulaciones enviadas" a={numero(ma?.total_enviadas)} b={numero(mb?.total_enviadas)} />
              <Fila etiquetaFila="Aprobaciones totales" a={numero(ma?.aprobaciones_totales)} b={numero(mb?.aprobaciones_totales)} />
              <Fila etiquetaFila="Aprobaciones parciales" a={numero(ma?.aprobaciones_parciales)} b={numero(mb?.aprobaciones_parciales)} />
              <Seccion titulo="Por estado" a={ma?.postulaciones_por_estado} b={mb?.postulaciones_por_estado} claves={ETIQUETA_ESTADO_POSTULACION} />
              <Seccion titulo="Por tipo de tramite" a={ma?.postulaciones_por_tipo} b={mb?.postulaciones_por_tipo} claves={{ PRIMERA_VEZ: 'Primera vez', RENOVACION: 'Renovacion', REINTEGRO: 'Reintegro' }} />
              <Seccion titulo="Por beneficio" a={ma?.postulaciones_por_beneficio} b={mb?.postulaciones_por_beneficio} />
              {montos(ma) || montos(mb) ? (
                <>
                  <tr className="bg-primary-10">
                    <th colSpan={3} className="px-3 py-1 text-left text-xs font-semibold uppercase tracking-wider">
                      Montos (otorgamientos no revocados)
                    </th>
                  </tr>
                  <Fila etiquetaFila="Monto aprobado total" a={moneda(montos(ma)?.monto_aprobado_total)} b={moneda(montos(mb)?.monto_aprobado_total)} />
                  <Fila etiquetaFila="Monto desembolsado" a={moneda(montos(ma)?.monto_desembolsado)} b={moneda(montos(mb)?.monto_desembolsado)} />
                  <Seccion titulo="Monto aprobado por beneficio" a={montos(ma)?.monto_aprobado_por_beneficio} b={montos(mb)?.monto_aprobado_por_beneficio} formato={moneda} />
                </>
              ) : (
                <Fila etiquetaFila="Montos" a="Pendiente del modulo de seguimiento" b="Pendiente del modulo de seguimiento" />
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
