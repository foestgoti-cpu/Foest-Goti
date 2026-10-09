import { Link } from 'react-router-dom';
import { Alert, Badge, Card, EmptyState, Spinner } from '../../../components/ui';
import { CATALOGO_ALERTAS, ETIQUETA_SEVERIDAD, SEVERIDADES, type Alerta, type RespuestaAlertas, type SeveridadAlerta } from '../types';
import { fechaHora } from './formato';

/**
 * Panel de alertas agrupadas por severidad y, dentro de cada severidad, por grupo
 * del panel (tabla de alertas de admin_dashboard.md). Cada alerta enlaza a la
 * pantalla que la resuelve; el panel no ejecuta acciones.
 */
export function agruparAlertas(alertas: Alerta[]): Array<{ severidad: SeveridadAlerta; grupos: Array<{ grupo: string; alertas: Alerta[] }> }> {
  return SEVERIDADES.map((severidad) => {
    const deSeveridad = alertas.filter((a) => a.severidad === severidad);
    const porGrupo = new Map<string, Alerta[]>();
    for (const a of deSeveridad) {
      const grupo = CATALOGO_ALERTAS[a.codigo]?.grupo ?? 'Otras';
      porGrupo.set(grupo, [...(porGrupo.get(grupo) ?? []), a]);
    }
    return { severidad, grupos: [...porGrupo.entries()].map(([grupo, lista]) => ({ grupo, alertas: lista })) };
  }).filter((s) => s.grupos.length > 0);
}

const tonoSeveridad: Record<SeveridadAlerta, 'relleno' | 'destacado' | 'neutro'> = { ALTA: 'relleno', MEDIA: 'destacado', BAJA: 'neutro' };

export function AlertasOperativasPanel({ datos, cargando, error }: { datos?: RespuestaAlertas; cargando: boolean; error?: Error | null }) {
  const secciones = agruparAlertas(datos?.alertas ?? []);
  return (
    <Card
      titulo="Alertas operativas"
      acciones={datos ? <Badge tono={datos.total > 0 ? 'relleno' : 'neutro'}>{datos.total} activas</Badge> : undefined}
      pie={datos ? `Calculadas a ${fechaHora(datos.generado_en)}. Umbrales editables en Configuracion (categoria Alertas).` : undefined}
    >
      {error && <Alert tipo="error" className="mb-3">{error.message}</Alert>}
      {cargando && !datos && <Spinner />}
      {datos && datos.detectores_con_error.length > 0 && (
        <Alert tipo="advertencia" className="mb-3">
          Algunos detectores no pudieron ejecutarse: {datos.detectores_con_error.map((d) => d.codigo).join(', ')}. El resto de alertas se muestra con normalidad.
        </Alert>
      )}
      {datos && datos.total === 0 && <EmptyState titulo="Sin alertas activas" descripcion="Ninguna condicion de alerta supera los umbrales configurados." />}
      {secciones.map((s) => (
        <section key={s.severidad} className="mb-4 last:mb-0" aria-labelledby={`sev-${s.severidad}`}>
          <h3 id={`sev-${s.severidad}`} className="mb-2 flex items-center gap-2 text-base">
            <Badge tono={tonoSeveridad[s.severidad]}>{ETIQUETA_SEVERIDAD[s.severidad]}</Badge>
            <span className="text-sm text-ink/70">{s.grupos.reduce((n, g) => n + g.alertas.length, 0)} alerta(s)</span>
          </h3>
          {s.grupos.map((g) => (
            <div key={g.grupo} className="mb-3 border border-ink rounded-xl overflow-hidden">
              <p className="border-b border-ink bg-primary-10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">{g.grupo}</p>
              <ul>
                {g.alertas.map((a, i) => {
                  const cat = CATALOGO_ALERTAS[a.codigo];
                  return (
                    <li key={`${a.codigo}-${a.entidad_id ?? i}`} className="flex flex-wrap items-start justify-between gap-2 border-b border-ink/30 px-3 py-2 last:border-b-0">
                      <div>
                        <p className="text-sm font-semibold">{cat?.titulo ?? a.codigo}</p>
                        <p className="text-sm">{a.mensaje}</p>
                      </div>
                      <Link to={a.accion_url} className="text-sm font-medium">
                        {cat?.accion ?? 'Ir'}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </Card>
  );
}
