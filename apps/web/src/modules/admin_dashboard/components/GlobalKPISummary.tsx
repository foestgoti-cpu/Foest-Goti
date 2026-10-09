import { Card, Spinner } from '../../../components/ui';
import type { Resumen } from '../types';
import { fechaHora, moneda, numero } from './formato';

/** Tarjetas de totales transversales (stat tiles: etiqueta en oracion, valor semibold). */
function Tile({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="border border-ink rounded-xl bg-white px-4 py-3">
      <p className="text-sm text-ink/80">{etiqueta}</p>
      <p className="mt-1 text-3xl font-semibold leading-tight">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-ink/70">{detalle}</p>}
    </div>
  );
}

function suma(lista: Array<{ estado: string; total: number }> | undefined, filtro?: (e: { estado: string }) => boolean): number {
  return (lista ?? []).filter((e) => (filtro ? filtro(e) : true)).reduce((acc, e) => acc + Number(e.total), 0);
}

export function GlobalKPISummary({ resumen, cargando }: { resumen?: Resumen; cargando: boolean }) {
  if (cargando && !resumen) {
    return (
      <Card titulo="Totales de la plataforma">
        <Spinner />
      </Card>
    );
  }
  if (!resumen) return null;
  const porRol = (rol: string) => resumen.usuarios.find((u) => u.rol === rol);
  const beneficiarios = porRol('BENEFICIARIO');
  const funcionarios = porRol('FUNCIONARIO');
  const habilitadas = suma(resumen.convocatorias, (c) => c.estado === 'HABILITADA');
  const postulaciones = suma(resumen.postulaciones, (p) => p.estado !== 'BORRADOR');
  const enEvaluacion = suma(resumen.postulaciones, (p) => p.estado === 'EN_EVALUACION');
  const pendientes = suma(resumen.postulaciones, (p) => p.estado === 'PENDIENTE');

  return (
    <Card titulo="Totales de la plataforma" pie={`Datos actualizados a ${fechaHora(resumen.generado_en)}${resumen.desde_cache ? ' (cache de 60 s)' : ''}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile etiqueta="Beneficiarios registrados" valor={numero((beneficiarios?.activos ?? 0) + (beneficiarios?.inactivos ?? 0))} detalle={`${numero(beneficiarios?.activos ?? 0)} activos`} />
        <Tile etiqueta="Funcionarios activos" valor={numero(funcionarios?.activos ?? 0)} detalle={`${numero(funcionarios?.inactivos ?? 0)} inactivos`} />
        <Tile etiqueta="Convocatorias habilitadas" valor={numero(habilitadas)} detalle={`${numero(suma(resumen.convocatorias))} en total`} />
        <Tile etiqueta="Postulaciones enviadas" valor={numero(postulaciones)} detalle={`${numero(pendientes)} pendientes, ${numero(enEvaluacion)} en evaluacion`} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {resumen.montos.estado === 'disponible' ? (
          <>
            <Tile etiqueta="Monto aprobado (otorgamientos no revocados)" valor={moneda(resumen.montos.monto_aprobado_total ?? 0)} detalle={`${numero(resumen.montos.otorgamientos_vigentes ?? 0)} otorgamientos vigentes`} />
            <Tile etiqueta="Monto desembolsado (pagado)" valor={moneda(resumen.montos.monto_desembolsado ?? 0)} />
          </>
        ) : (
          <div className="border border-dashed rounded-xl border-ink px-4 py-3 text-sm sm:col-span-2">
            <p className="font-semibold">Montos otorgados y desembolsados</p>
            <p className="mt-1 text-ink/80">Pendiente del modulo de seguimiento de beneficios (tabla de otorgamientos aun no disponible).</p>
          </div>
        )}
      </div>
      {!resumen.festivos_anio_siguiente_cargados && (
        <p className="mt-3 border-l-2 border-ink pl-2 text-sm">
          No hay festivos cargados para el proximo ano; el calculo de dias habiles de ese ano no sera confiable. Carguelos en Festivos.
        </p>
      )}
    </Card>
  );
}
