import { Link } from 'react-router-dom';
import { Badge, Button, Card } from '../../../components/ui';
import type { ConvocatoriaPublica } from '../types';
import { formatearFechaLocal, formatearMoneda, periodo, textoDiasRestantes } from '../utils';

/** Tarjeta publica de una convocatoria abierta: beneficios, fechas y contador de dias restantes. */
export function ConvocatoriaCard({ convocatoria, detallada = false }: { convocatoria: ConvocatoriaPublica; detallada?: boolean }) {
  const c = convocatoria;
  return (
    <Card
      titulo={
        <span>
          {c.nombre} <span className="font-normal text-ink/70">({periodo(c.anio, c.semestre)})</span>
        </span>
      }
      acciones={<Badge tono={c.dias_restantes <= 3 ? 'relleno' : 'destacado'}>{textoDiasRestantes(c.dias_restantes)}</Badge>}
      pie={
        !detallada ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Cierre: {formatearFechaLocal(c.fecha_cierre)} a las 23:59 (hora de Colombia)</span>
            <Link to={`/convocatorias/${c.id}`} className="no-underline hover:no-underline">
              <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm">
                Ver detalle
              </Button>
            </Link>
          </div>
        ) : undefined
      }
    >
      {c.descripcion && <p className="mb-4 text-base">{c.descripcion}</p>}
      <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="border border-ink/30 rounded-lg px-3 py-2">
          <dt className="font-semibold">Apertura</dt>
          <dd>{formatearFechaLocal(c.fecha_apertura.slice(0, 10) === c.fecha_apertura ? c.fecha_apertura : aperturaLocal(c.fecha_apertura))}</dd>
        </div>
        <div className="border border-ink/30 rounded-lg px-3 py-2">
          <dt className="font-semibold">Cierre</dt>
          <dd>{formatearFechaLocal(c.fecha_cierre)} (23:59:59)</dd>
        </div>
      </dl>
      <h3 className="mb-2 text-base">Beneficios ofertados</h3>
      {c.beneficios.length === 0 ? (
        <p className="text-sm">Sin beneficios publicados.</p>
      ) : (
        <ul className="divide-y divide-ink/30 border border-ink/30 rounded-lg overflow-hidden">
          {c.beneficios.map((b) => (
            <li key={b.codigo} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <span className="font-semibold">{b.nombre}</span>
                <span className="ml-2 font-mono text-xs text-ink/70">{b.codigo}</span>
                {detallada && b.descripcion && <p className="mt-1 text-ink/80">{b.descripcion}</p>}
              </div>
              <div className="text-right text-xs text-ink/80">
                {b.cupos_estimados > 0 && <div>Cupos estimados: {b.cupos_estimados}</div>}
                {b.valor_apoyo_referencial > 0 && <div>Valor referencial: {formatearMoneda(b.valor_apoyo_referencial)}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function aperturaLocal(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
