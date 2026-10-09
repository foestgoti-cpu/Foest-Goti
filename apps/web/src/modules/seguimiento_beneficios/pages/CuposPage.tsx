import { useState } from 'react';
import type { CupoBeneficioDto } from '@foest/shared';
import { Alert, Card, PageHeader, Select, Spinner, Table } from '../../../components/ui';
import { useConvocatoriasFiltro, useCupos } from '../hooks/useSeguimiento';
import { ETIQUETA_ALERTA, formatearMoneda, mensajeDeError, nombreBeneficio, porcentaje } from '../utils';

/** Barra sobria: relleno solido (cupos) o rayado (presupuesto) sobre pista blanca con borde; la marca indica el umbral. */
function Barra({ pct, umbral, rayada, etiqueta }: { pct: number; umbral?: number; rayada?: boolean; etiqueta: string }) {
  const ancho = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div
        className="relative h-4 flex-1 border border-ink rounded-full overflow-hidden bg-white"
        role="img"
        aria-label={`${etiqueta}: ${porcentaje(pct)}${umbral ? `, umbral ${umbral} %` : ''}`}
      >
        <div
          className="h-full bg-primary"
          style={{
            width: `${ancho}%`,
            ...(rayada ? { backgroundImage: 'repeating-linear-gradient(45deg, var(--color-primary) 0 4px, var(--color-white) 4px 7px)' } : {}),
          }}
        />
        {umbral ? <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${Math.min(100, umbral)}%` }} aria-hidden="true" /> : null}
      </div>
      <span className="w-16 text-right font-mono text-xs">{porcentaje(pct)}</span>
    </div>
  );
}

/** `/admin/seguimiento/cupos`: ocupacion de cupos y presupuesto por beneficio con alertas de umbral. */
export function CuposPage() {
  const [convocatoria, setConvocatoria] = useState('');
  const convocatorias = useConvocatoriasFiltro();
  const { data, isLoading, error } = useCupos(convocatoria || undefined);
  const filas = data ?? [];
  const alertas = filas.filter((c) => c.alerta_cupos !== 'NORMAL' || c.alerta_presupuesto !== 'NORMAL');

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Seguimiento de beneficios', ruta: '/admin/seguimiento' }, { etiqueta: 'Cupos y presupuesto' }]}
        titulo="Cupos y presupuesto"
        descripcion="Ocupacion de cupos y presupuesto comprometido por beneficio. La marca vertical indica el umbral de alerta."
      />
      <div className="mb-4 max-w-sm">
        <label htmlFor="f-conv" className="mb-1 block text-sm font-semibold">
          Convocatoria
        </label>
        <Select
          id="f-conv"
          placeholder="Todas"
          opciones={(convocatorias.data?.data ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
          value={convocatoria}
          onChange={(e) => setConvocatoria(e.target.value)}
        />
      </div>
      {error && <Alert tipo="error" className="mb-4">{mensajeDeError(error)}</Alert>}
      {isLoading && <Spinner />}
      {alertas.map((c) => (
        <Alert key={`${c.convocatoria_id}-${c.beneficio_codigo}`} tipo="advertencia" className="mb-3" titulo={`Alerta: ${nombreBeneficio(c.beneficio_codigo, c.beneficio_nombre)}`}>
          {c.convocatoria_nombre ?? 'Convocatoria'}: cupos {ETIQUETA_ALERTA[c.alerta_cupos].toLowerCase()} ({porcentaje(c.pct_cupos)}), presupuesto{' '}
          {ETIQUETA_ALERTA[c.alerta_presupuesto].toLowerCase()} ({porcentaje(c.pct_presupuesto)}). Umbral configurado: {c.umbral_alerta_pct} %.
        </Alert>
      ))}

      {!isLoading && filas.length > 0 && (
        <Card titulo="Ocupacion por beneficio" className="mb-6">
          <div className="mb-3 flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-6 border border-ink rounded bg-primary" aria-hidden="true" />Cupos</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-6 border border-ink rounded" style={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--color-primary) 0 4px, var(--color-white) 4px 7px)' }} aria-hidden="true" />
              Presupuesto
            </span>
          </div>
          <ul className="space-y-4">
            {filas.map((c: CupoBeneficioDto) => (
              <li key={`${c.convocatoria_id}-${c.beneficio_codigo}`}>
                <p className="mb-1 text-sm font-semibold">
                  {nombreBeneficio(c.beneficio_codigo, c.beneficio_nombre)}
                  <span className="font-normal text-ink/70"> - {c.convocatoria_nombre ?? ''}</span>
                </p>
                <Barra pct={c.pct_cupos} umbral={c.umbral_alerta_pct} etiqueta="Cupos" />
                <div className="mt-1" />
                <Barra pct={c.pct_presupuesto} umbral={c.umbral_alerta_pct} rayada etiqueta="Presupuesto" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Table<CupoBeneficioDto>
        caption="Ocupacion de cupos y presupuesto (vista de tabla)"
        columnas={[
          { clave: 'beneficio', titulo: 'Beneficio', render: (c) => nombreBeneficio(c.beneficio_codigo, c.beneficio_nombre) },
          { clave: 'convocatoria', titulo: 'Convocatoria', render: (c) => c.convocatoria_nombre ?? '-' },
          { clave: 'cupos', titulo: 'Cupos', alineacion: 'derecha', render: (c) => `${c.cupos_ocupados} / ${c.cupos_estimados} (${porcentaje(c.pct_cupos)})` },
          { clave: 'alerta_cupos', titulo: 'Alerta cupos', render: (c) => ETIQUETA_ALERTA[c.alerta_cupos] },
          { clave: 'asignado', titulo: 'Presupuesto', alineacion: 'derecha', render: (c) => formatearMoneda(c.presupuesto_asignado) },
          { clave: 'comprometido', titulo: 'Comprometido', alineacion: 'derecha', render: (c) => `${formatearMoneda(c.presupuesto_comprometido)} (${porcentaje(c.pct_presupuesto)})` },
          { clave: 'pagado', titulo: 'Pagado', alineacion: 'derecha', render: (c) => formatearMoneda(c.presupuesto_pagado) },
          { clave: 'alerta_pres', titulo: 'Alerta presupuesto', render: (c) => ETIQUETA_ALERTA[c.alerta_presupuesto] },
        ]}
        filas={filas}
        obtenerId={(c) => `${c.convocatoria_id}-${c.beneficio_codigo}`}
        cargando={isLoading}
        vacio={{ titulo: 'Sin datos de cupos', descripcion: 'No hay beneficios con cupos o presupuesto definidos.' }}
      />
    </>
  );
}
