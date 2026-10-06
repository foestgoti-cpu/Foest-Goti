import { useParams } from 'react-router-dom';
import { BENEFICIOS_CATALOGO, TITULOS_SECCION, type SeccionFormulario } from '@foest/shared';
import { Alert, Badge, Card, PageHeader, Spinner } from '../../../components/ui';
import { useHistorialAdmin, usePostulacionAdmin } from '../hooks/usePostulaciones';
import { fechaLarga, TEXTO_TIPO_SOLICITUD } from '../formato';

function Valor({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === '') return <>-</>;
  if (typeof v === 'object') {
    return (
      <dl className="ml-3 border-l border-ink/30 pl-2">
        {Object.entries(v as Record<string, unknown>).map(([k, x]) => (
          <div key={k}>
            <dt className="inline font-semibold">{k.replace(/_/g, ' ')}: </dt>
            <dd className="inline">
              <Valor v={x} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <>{String(v)}</>;
}

export function AdminPostulacionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, isLoading, error } = usePostulacionAdmin(id);
  const { data: historial } = useHistorialAdmin(id);

  if (isLoading) return <Spinner />;
  if (error || !p) return <Alert tipo="error">{(error as Error | null)?.message ?? 'Postulacion no encontrada'}</Alert>;

  const secciones = Object.keys(p.datos_formulario) as SeccionFormulario[];

  return (
    <>
      <PageHeader
        titulo={`Postulacion de ${p.beneficiario ? `${p.beneficiario.nombres ?? ''} ${p.beneficiario.apellidos ?? ''}`.trim() : p.beneficiario_id}`}
        migas={[{ etiqueta: 'Postulaciones', ruta: '/admin/postulaciones' }, { etiqueta: 'Detalle' }]}
        descripcion={
          <span>
            {p.convocatoria?.nombre ?? p.convocatoria_id}. Tramite: {TEXTO_TIPO_SOLICITUD[p.tipo_solicitud] ?? p.tipo_solicitud}. Estado: <Badge tono="destacado">{p.estado}</Badge>. Ciclo {p.ciclo}, version {p.version}.
            Lectura registrada en auditoria.
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card titulo="Resumen">
          <dl className="grid grid-cols-1 gap-y-1 text-sm">
            <dt className="font-semibold">Beneficios solicitados</dt>
            <dd>{p.beneficios.map((b) => BENEFICIOS_CATALOGO.find((c) => c.codigo === b)?.nombre ?? b).join(', ') || '-'}</dd>
            <dt className="font-semibold">Valor de matricula en letras</dt>
            <dd className="uppercase">{p.valor_matricula_letras ?? '-'}</dd>
            <dt className="font-semibold">Enviada</dt>
            <dd>{fechaLarga(p.enviada_en)}</dd>
            <dt className="font-semibold">Plazo de subsanacion</dt>
            <dd>{fechaLarga(p.fecha_limite_subsanacion)}</dd>
            <dt className="font-semibold">Aprobacion parcial</dt>
            <dd>{p.aprobacion_parcial ? 'Si' : 'No'}</dd>
          </dl>
          {p.correccion_vigente && (
            <div className="mt-3 border-t border-ink pt-3 text-sm">
              <p className="font-semibold">Correccion vigente</p>
              <Valor v={p.correccion_vigente} />
            </div>
          )}
        </Card>
        <Card titulo="Formulario GE-F041">
          {secciones.length === 0 && <p className="text-sm">Sin datos diligenciados.</p>}
          {secciones.map((s) => (
            <div key={s} className="mb-3 text-sm">
              <h3 className="text-base">{TITULOS_SECCION[s] ?? s}</h3>
              <Valor v={p.datos_formulario[s as keyof typeof p.datos_formulario]} />
            </div>
          ))}
        </Card>
      </div>
      <Card titulo="Historial (con actor)" className="mt-4">
        {!historial || historial.length === 0 ? (
          <p className="text-sm">Sin movimientos.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-primary-10">
              <tr>
                {['Fecha', 'Ciclo', 'De', 'A', 'Motivo', 'Actor', 'Observaciones'].map((t) => (
                  <th key={t} className="border-b border-ink px-2 py-1 text-left">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historial.map((h) => (
                <tr key={h.id} className="border-b border-ink/30">
                  <td className="px-2 py-1">{fechaLarga(h.cambiado_en)}</td>
                  <td className="px-2 py-1">{h.ciclo}</td>
                  <td className="px-2 py-1">{h.estado_anterior ?? '-'}</td>
                  <td className="px-2 py-1">{h.estado_nuevo}</td>
                  <td className="px-2 py-1">{h.motivo}</td>
                  <td className="px-2 py-1">
                    {h.actor_tipo}
                    {h.actor_id && <span className="block font-mono text-xs">{h.actor_id}</span>}
                  </td>
                  <td className="px-2 py-1">{h.observaciones ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
