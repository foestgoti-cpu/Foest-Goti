import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, PageHeader, Spinner } from '../../../components/ui';
import { AmpliarModal, ArchivarModal, DeshabilitarModal, HabilitarModal, RehabilitarModal } from '../components/AccionModales';
import { ComiteSelector } from '../components/ComiteSelector';
import { ConvocatoriaForm } from '../components/ConvocatoriaForm';
import { EstadoConvocatoriaBadge } from '../components/EstadoConvocatoriaBadge';
import { AmpliacionesTable, HistorialEstadosTable } from '../components/HistorialTablas';
import { useConvocatoria, useMutacionesConvocatoria } from '../hooks/useConvocatorias';
import type { ConvocatoriaDetalle } from '../types';
import { formatearFechaLocal, formatearMoneda, mensajeDeError, periodo, textoDiasRestantes } from '../utils';

type Pestana = 'datos' | 'comite' | 'ampliaciones' | 'historial';
type Modal = 'habilitar' | 'deshabilitar' | 'rehabilitar' | 'ampliar' | 'archivar' | null;

const PESTANAS: Array<{ id: Pestana; etiqueta: string }> = [
  { id: 'datos', etiqueta: 'Datos y beneficios' },
  { id: 'comite', etiqueta: 'Comite evaluador' },
  { id: 'ampliaciones', etiqueta: 'Ampliaciones' },
  { id: 'historial', etiqueta: 'Historial de estados' },
];

/** `/admin/convocatorias/:id`: detalle con pestanas y acciones de ciclo de vida (modales de doble intencion). */
export function ConvocatoriaAdminDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useConvocatoria(id);
  const m = useMutacionesConvocatoria(id);
  const [pestana, setPestana] = useState<Pestana>('datos');
  const [modal, setModal] = useState<Modal>(null);
  const [editando, setEditando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (isLoading) return <Spinner etiqueta="Cargando convocatoria" />;
  if (error || !data) {
    return (
      <Card titulo="Convocatoria">
        <Alert tipo="error">{error ? mensajeDeError(error) : 'No fue posible cargar la convocatoria.'}</Alert>
        <Button className="mt-4" variante="secundario" onClick={() => navigate('/admin/convocatorias')}>
          Volver al listado
        </Button>
      </Card>
    );
  }
  const c: ConvocatoriaDetalle = data;
  const cerrar = () => {
    setModal(null);
    m.habilitar.reset();
    m.deshabilitar.reset();
    m.rehabilitar.reset();
    m.ampliar.reset();
    m.archivar.reset();
  };
  const exito = (texto: string) => {
    cerrar();
    setMensaje(texto);
  };
  const editable = c.estado === 'BORRADOR' || c.estado === 'HABILITADA' || c.estado === 'SUSPENDIDA';
  const totalPostulaciones = Object.values(c.postulaciones_por_estado).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <>
      <PageHeader
        titulo={`${c.nombre} (${periodo(c.anio, c.semestre)})`}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <EstadoConvocatoriaBadge estado={c.estado} abierta={c.abierta} />
            <span>
              Apertura {formatearFechaLocal(c.fecha_apertura_local)} - Cierre {formatearFechaLocal(c.fecha_cierre)} 23:59:59
              {c.abierta && ` (${textoDiasRestantes(c.dias_restantes)})`}
            </span>
          </span>
        }
        migas={[{ etiqueta: 'Convocatorias', ruta: '/admin/convocatorias' }, { etiqueta: c.nombre }]}
        acciones={
          <>
            {c.estado === 'BORRADOR' && <Button onClick={() => setModal('habilitar')}>Habilitar</Button>}
            {c.estado === 'HABILITADA' && (
              <Button variante="secundario" onClick={() => setModal('deshabilitar')}>
                Suspender
              </Button>
            )}
            {c.estado === 'SUSPENDIDA' && <Button onClick={() => setModal('rehabilitar')}>Rehabilitar</Button>}
            {(c.estado === 'HABILITADA' || c.estado === 'SUSPENDIDA') && (
              <Button variante="secundario" onClick={() => setModal('ampliar')}>
                Ampliar plazo
              </Button>
            )}
            {c.estado === 'CERRADA' && (
              <>
                <Button variante="secundario" onClick={() => setModal('ampliar')}>
                  Reabrir
                </Button>
                <Button onClick={() => setModal('archivar')}>Archivar</Button>
              </>
            )}
          </>
        }
      />

      {mensaje && (
        <Alert tipo="exito" className="mb-4">
          {mensaje}
        </Alert>
      )}
      {c.estado === 'SUSPENDIDA' && c.motivo_suspension && (
        <Alert tipo="advertencia" titulo="Convocatoria suspendida" className="mb-4">
          Motivo: {c.motivo_suspension}
        </Alert>
      )}

      <div role="tablist" aria-label="Secciones de la convocatoria" className="mb-4 flex flex-wrap border-b border-ink">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={pestana === p.id}
            className={`-mb-px border border-b-0 px-4 py-2 text-sm font-medium ${pestana === p.id ? 'border-ink bg-primary-10' : 'border-transparent hover:bg-primary-10'}`}
            onClick={() => setPestana(p.id)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'datos' && (
        <div className="space-y-4">
          <Card titulo="Resumen de postulaciones">
            <dl className="grid gap-2 text-sm sm:grid-cols-4">
              {(['BORRADOR', 'PENDIENTE', 'EN_EVALUACION', 'EN_CORRECCION', 'APROBADA', 'RECHAZADA', 'DESISTIDA'] as const).map((e) => (
                <div key={e} className="border border-ink/30 px-3 py-2">
                  <dt className="text-xs uppercase tracking-wide text-ink/70">{e.replace('_', ' ')}</dt>
                  <dd className="text-lg font-semibold">{c.postulaciones_por_estado[e] ?? 0}</dd>
                </div>
              ))}
              <div className="border border-ink px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-ink/70">Total</dt>
                <dd className="text-lg font-semibold">{totalPostulaciones}</dd>
              </div>
            </dl>
          </Card>

          {editando ? (
            <Card titulo="Editar convocatoria">
              <ConvocatoriaForm
                inicial={c}
                soloInformativo={c.estado !== 'BORRADOR'}
                enviando={m.actualizar.isPending}
                errorApi={m.actualizar.error ? mensajeDeError(m.actualizar.error) : null}
                onEnviar={(datos) =>
                  m.actualizar.mutate(
                    c.estado === 'BORRADOR'
                      ? { ...datos, version: c.version }
                      : { version: c.version, nombre: datos.nombre, descripcion: datos.descripcion, beneficios: datos.beneficios },
                    {
                      onSuccess: () => {
                        setEditando(false);
                        setMensaje('Convocatoria actualizada.');
                      },
                    },
                  )
                }
                onCancelar={() => setEditando(false)}
              />
            </Card>
          ) : (
            <Card
              titulo="Datos y beneficios ofertados"
              acciones={
                editable ? (
                  <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={() => setEditando(true)}>
                    Editar
                  </Button>
                ) : undefined
              }
            >
              {c.descripcion ? <p className="mb-4">{c.descripcion}</p> : <p className="mb-4 text-sm text-ink/70">Sin descripcion.</p>}
              <div className="overflow-x-auto border border-ink">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-primary-10">
                    <tr>
                      <th scope="col" className="border-b border-ink px-3 py-2 text-left">
                        Beneficio
                      </th>
                      <th scope="col" className="border-b border-ink px-3 py-2 text-right">
                        Cupos estimados
                      </th>
                      <th scope="col" className="border-b border-ink px-3 py-2 text-right">
                        Presupuesto asignado
                      </th>
                      <th scope="col" className="border-b border-ink px-3 py-2 text-right">
                        Valor referencial
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.beneficios.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center">
                          Sin beneficios ofertados. Edite la convocatoria para agregarlos antes de habilitarla.
                        </td>
                      </tr>
                    )}
                    {c.beneficios.map((b) => (
                      <tr key={b.codigo} className="border-b border-ink/30 last:border-b-0">
                        <td className="px-3 py-2">
                          {b.nombre} <span className="font-mono text-xs text-ink/70">{b.codigo}</span>
                        </td>
                        <td className="px-3 py-2 text-right">{b.cupos_estimados}</td>
                        <td className="px-3 py-2 text-right">{formatearMoneda(b.presupuesto_asignado)}</td>
                        <td className="px-3 py-2 text-right">{formatearMoneda(b.valor_apoyo_referencial)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {c.beneficios.length > 0 && (
                    <tfoot>
                      <tr className="bg-primary-10 font-semibold">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right">{c.beneficios.reduce((s, b) => s + b.cupos_estimados, 0)}</td>
                        <td className="px-3 py-2 text-right">{formatearMoneda(c.beneficios.reduce((s, b) => s + b.presupuesto_asignado, 0))}</td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="mt-3 text-xs text-ink/70">Version {c.version}. Ultima actualizacion: {new Date(c.actualizado_en).toLocaleString('es-CO')}.</p>
            </Card>
          )}
        </div>
      )}

      {pestana === 'comite' && (
        <Card titulo={`Comite evaluador (${c.comite.length})`}>
          <ComiteSelector
            key={c.comite.map((x) => x.funcionario_id).join(',')}
            comiteActual={c.comite}
            guardando={m.definirComite.isPending}
            errorGuardar={m.definirComite.error}
            soloLectura={c.estado === 'ARCHIVADA'}
            onGuardar={(datos) => m.definirComite.mutate(datos, { onSuccess: () => setMensaje('Comite actualizado.') })}
          />
        </Card>
      )}

      {pestana === 'ampliaciones' && <AmpliacionesTable ampliaciones={c.ampliaciones} />}
      {pestana === 'historial' && <HistorialEstadosTable cambios={c.cambios_estado} />}

      <HabilitarModal
        convocatoria={c}
        abierto={modal === 'habilitar'}
        cargando={m.habilitar.isPending}
        error={m.habilitar.error}
        onCerrar={cerrar}
        onConfirmar={() => m.habilitar.mutate(c.version, { onSuccess: () => exito('Convocatoria habilitada.') })}
      />
      <DeshabilitarModal
        convocatoria={c}
        abierto={modal === 'deshabilitar'}
        cargando={m.deshabilitar.isPending}
        error={m.deshabilitar.error}
        onCerrar={cerrar}
        onConfirmar={(motivo) =>
          m.deshabilitar.mutate(
            { motivo, version: c.version },
            {
              onSuccess: (r) =>
                exito(`Convocatoria suspendida. Borradores afectados: ${r.afectadas.borradores}; postulaciones en curso: ${r.afectadas.en_curso}; beneficiarios notificados: ${r.afectadas.notificados}.`),
            },
          )
        }
      />
      <RehabilitarModal
        convocatoria={c}
        abierto={modal === 'rehabilitar'}
        cargando={m.rehabilitar.isPending}
        error={m.rehabilitar.error}
        onCerrar={cerrar}
        onConfirmar={() => m.rehabilitar.mutate(c.version, { onSuccess: () => exito('Convocatoria rehabilitada.') })}
      />
      <AmpliarModal
        key={`ampliar-${c.version}`}
        convocatoria={c}
        abierto={modal === 'ampliar'}
        cargando={m.ampliar.isPending}
        error={m.ampliar.error}
        onCerrar={cerrar}
        onConfirmar={(datos) =>
          m.ampliar.mutate({ ...datos, version: c.version }, { onSuccess: () => exito(c.estado === 'CERRADA' ? 'Convocatoria reabierta.' : 'Plazo ampliado.') })
        }
      />
      <ArchivarModal
        convocatoria={c}
        abierto={modal === 'archivar'}
        cargando={m.archivar.isPending}
        error={m.archivar.error}
        onCerrar={cerrar}
        onConfirmar={() => m.archivar.mutate(c.version, { onSuccess: () => exito('Convocatoria archivada.') })}
      />
    </>
  );
}
