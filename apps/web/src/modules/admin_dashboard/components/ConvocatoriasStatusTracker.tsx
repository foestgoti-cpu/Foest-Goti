import { Link } from 'react-router-dom';
import { Badge, Card, Table } from '../../../components/ui';
import type { ConvocatoriaConsolidada } from '../types';
import { ETIQUETA_ESTADO_CONVOCATORIA, etiqueta, fecha, moneda, numero } from './formato';

/** Medidor de avance: relleno primario sobre pista en tinte del mismo azul (una sola rampa). */
function Avance({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 bg-primary-20" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label="Avance de resolucion">
        <div className="h-2 bg-primary" style={{ width: `${p}%` }} />
      </div>
      <span className="text-sm tabular-nums">{p} %</span>
    </div>
  );
}

export function ConvocatoriasStatusTracker({ convocatorias, cargando }: { convocatorias: ConvocatoriaConsolidada[]; cargando: boolean }) {
  return (
    <Card titulo="Estado de convocatorias">
      <Table<ConvocatoriaConsolidada>
        caption="Convocatorias con avance, comite y cupos"
        columnas={[
          {
            clave: 'periodo',
            titulo: 'Periodo',
            render: (c) => (
              <div>
                <Link to={`/admin/convocatorias/${c.id}`} className="font-semibold">
                  {c.periodo}
                </Link>
                <p className="text-xs text-ink/70">{c.nombre}</p>
              </div>
            ),
          },
          { clave: 'estado', titulo: 'Estado', render: (c) => <Badge tono={c.estado === 'HABILITADA' ? 'relleno' : 'neutro'}>{etiqueta(ETIQUETA_ESTADO_CONVOCATORIA, c.estado)}</Badge> },
          { clave: 'plazo', titulo: 'Apertura / cierre', render: (c) => `${fecha(c.fecha_apertura)} a ${fecha(c.fecha_cierre_exclusiva)}` },
          {
            clave: 'comite',
            titulo: 'Comite',
            render: (c) => (c.comite.length === 0 ? <span className="font-semibold">Sin comite</span> : `${c.comite.length} funcionario(s)`),
          },
          {
            clave: 'postulaciones',
            titulo: 'Postulaciones',
            render: (c) => (
              <span className="text-sm">
                {numero(c.total_enviadas)} enviadas
                <span className="block text-xs text-ink/70">
                  {numero(c.postulaciones_por_estado.PENDIENTE ?? 0)} pend. / {numero(c.postulaciones_por_estado.EN_EVALUACION ?? 0)} en eval. / {numero(c.postulaciones_por_estado.APROBADA ?? 0)} aprob.
                </span>
              </span>
            ),
          },
          { clave: 'avance', titulo: 'Avance', render: (c) => <Avance pct={c.avance_pct} /> },
          {
            clave: 'cupos',
            titulo: 'Cupos / presupuesto',
            render: (c) => (
              <span className="text-sm">
                {c.ocupacion.estado === 'disponible' ? `${numero(c.ocupacion.otorgamientos ?? 0)} de ` : ''}
                {numero(c.cupos_estimados)} cupos
                <span className="block text-xs text-ink/70">
                  {c.ocupacion.estado === 'disponible' ? `${moneda(c.ocupacion.monto_aprobado ?? 0)} de ` : ''}
                  {moneda(c.presupuesto_asignado)}
                </span>
              </span>
            ),
          },
        ]}
        filas={convocatorias}
        obtenerId={(c) => c.id}
        cargando={cargando}
        vacio={{ titulo: 'Sin convocatorias', descripcion: 'Aun no se ha creado ninguna convocatoria.' }}
      />
    </Card>
  );
}
