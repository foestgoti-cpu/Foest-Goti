import { useMemo, useState } from 'react';
import { BENEFICIOS_CATALOGO, TITULOS_SECCION, type SeccionFormulario } from '@foest/shared';
import { Alert, Checkbox, FormField, Input, Modal, Select, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { fechaCorta } from '../../postulaciones/formato';
import { useDictaminar } from '../hooks/useEvaluacion';
import { DictamenInputSchema, OBSERVACION_MIN_CARACTERES as OBSERVACION_MIN, type DecisionBeneficio, type DictamenInput, type ExpedienteEvaluacionDto, type ResultadoDictamen } from '../types';

interface DecisionLocal {
  decision: DecisionBeneficio;
  motivo: string;
  monto: string;
}

const TEXTO_RESULTADO: Record<ResultadoDictamen, string> = {
  APROBAR: 'Aprobar',
  RECHAZAR: 'Rechazar',
  CORRECCION: 'Solicitar correccion',
};

const nombreBeneficio = (c: string) => BENEFICIOS_CATALOGO.find((b) => b.codigo === c)?.nombre ?? c;
const CODIGOS_BENEFICIO_VALIDOS = new Set<string>(BENEFICIOS_CATALOGO.map((b) => b.codigo));

/** Dictamen final con decision por beneficio y confirmacion de doble intencion (`confirmar: true`). */
export function DictamenFinalModal({
  abierto,
  expediente: e,
  onCerrar,
  onFinalizado,
  onConflicto,
}: {
  abierto: boolean;
  expediente: ExpedienteEvaluacionDto;
  onCerrar: () => void;
  /** Se invoca tras un dictamen exitoso. */
  onFinalizado: () => void;
  /** 409 VERSION_CONFLICTO u otros 409: la pagina recarga el expediente con aviso. */
  onConflicto: (mensaje: string) => void;
}) {
  const [resultado, setResultado] = useState<ResultadoDictamen>('APROBAR');
  const [decisiones, setDecisiones] = useState<Record<string, DecisionLocal>>({});
  const [observaciones, setObservaciones] = useState('');
  const [campos, setCampos] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const [fecha, setFecha] = useState(e.subsanacion.fecha_limite_sugerida);
  const [paso, setPaso] = useState<'edicion' | 'resumen'>('edicion');
  const [errorApi, setErrorApi] = useState<{ mensaje: string; detalle: string[] } | null>(null);
  const dictaminar = useDictaminar(e.postulacion.id);

  const dec = (c: string): DecisionLocal => decisiones[c] ?? { decision: 'APROBADO', motivo: '', monto: '' };
  const cambiar = (c: string, p: Partial<DecisionLocal>) => setDecisiones((m) => ({ ...m, [c]: { ...dec(c), ...p } }));

  const decisionEfectiva = (c: string): DecisionBeneficio => (resultado === 'RECHAZAR' ? 'RECHAZADO' : dec(c).decision);
  const secciones = Object.keys(e.formulario ?? {});
  const codigos = e.beneficios.map((b) => b.codigo);
  const p = e.postulacion;

  const construir = (): DictamenInput => {
    const beneficios =
      resultado === 'CORRECCION'
        ? []
        : codigos.map((c) => {
            const d = dec(c);
            const decision = decisionEfectiva(c);
            return {
              codigo: c,
              decision,
              ...(decision === 'RECHAZADO' ? { motivo: d.motivo.trim() } : {}),
              ...(decision === 'APROBADO' && d.monto !== '' ? { monto_aprobado: Number(d.monto) } : {}),
            };
          });
    return {
      version: p.version,
      confirmar: true,
      resultado,
      beneficios,
      observaciones: observaciones.trim(),
      ...(resultado === 'CORRECCION' ? { campos_observados: campos, documentos_observados: docs } : {}),
      ...(resultado === 'CORRECCION' && fecha ? { fecha_limite_subsanacion: fecha } : {}),
    };
  };

  // Validacion en cliente con el mismo esquema que usa la API.
  const problemas = useMemo(() => {
    const r = DictamenInputSchema.safeParse(construir());
    if (r.success) return [] as string[];
    return Array.from(
      new Set(
        r.error.issues.map((i) => {
          const c = i.path[0] === 'beneficios' && typeof i.path[1] === 'number' ? codigos[i.path[1]] : undefined;
          return c && CODIGOS_BENEFICIO_VALIDOS.has(c) ? `${nombreBeneficio(c)}: ${i.message}` : i.message;
        }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado, decisiones, observaciones, campos, docs, fecha, p.version]);

  const cerrar = () => {
    setPaso('edicion');
    setErrorApi(null);
    onCerrar();
  };

  const emitir = async () => {
    setErrorApi(null);
    try {
      await dictaminar.mutateAsync(construir());
      setPaso('edicion');
      onFinalizado();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 409) {
          setPaso('edicion');
          onConflicto(
            err.code === 'VERSION_CONFLICTO'
              ? 'La postulacion cambio mientras usted la revisaba. Se recargo el expediente; verifique la informacion y vuelva a dictaminar.'
              : err.message,
          );
          return;
        }
        let detalle: string[] = [];
        if (Array.isArray(err.details)) {
          detalle = err.details.map((d) => {
            const o = d as Record<string, unknown>;
            if (o && typeof o === 'object' && ('beneficio' in o || 'tipo_codigo' in o)) {
              return `Beneficio ${String(o.beneficio ?? '-')}: documento ${String(o.tipo_codigo ?? '-')} pendiente`;
            }
            return typeof d === 'string' ? d : JSON.stringify(d);
          });
        }
        if (err.status === 503) {
          setErrorApi({ mensaje: 'El chequeo documental no esta disponible por el momento. Intente de nuevo mas tarde.', detalle: [] });
          setPaso('edicion');
          return;
        }
        setErrorApi({ mensaje: err.code === 'DOCUMENTOS_OBLIGATORIOS_PENDIENTES' ? 'Hay documentos obligatorios pendientes de calificar o presentar.' : err.message, detalle });
        setPaso('edicion');
        return;
      }
      setErrorApi({ mensaje: (err as Error).message, detalle: [] });
      setPaso('edicion');
    }
  };

  const toggle = (lista: string[], set: (v: string[]) => void, v: string) =>
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <Modal
      abierto={abierto}
      titulo={paso === 'edicion' ? 'Dictamen final' : 'Confirmar dictamen'}
      onCerrar={cerrar}
      textoConfirmar={paso === 'edicion' ? 'Revisar resumen' : 'Emitir dictamen definitivo'}
            confirmacion={paso === 'resumen' ? { palabra: 'CONFIRMAR', comprension: 'Entiendo que el dictamen es definitivo, no podra modificarse y sera notificado al beneficiario.' } : undefined}
      cargando={dictaminar.isPending}
      onConfirmar={paso === 'edicion' ? () => { if (problemas.length === 0) setPaso('resumen'); } : emitir}
    >
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {errorApi && (
          <Alert tipo="error" className="mb-3">
            {errorApi.mensaje}
            {errorApi.detalle.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm">
                {errorApi.detalle.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        {paso === 'edicion' ? (
          <>
            <FormField etiqueta="Resultado" obligatorio>
              <Select
                value={resultado}
                onChange={(ev) => setResultado(ev.target.value as ResultadoDictamen)}
                opciones={(['APROBAR', 'RECHAZAR', 'CORRECCION'] as const).map((r) => ({ valor: r, etiqueta: TEXTO_RESULTADO[r] }))}
              />
            </FormField>

            {resultado !== 'CORRECCION' && (
              <fieldset className="mb-4">
                <legend className="mb-1 text-sm font-semibold">Decision por beneficio</legend>
                {codigos.map((c) => {
                  const d = dec(c);
                  const decision = decisionEfectiva(c);
                  return (
                    <div key={c} className="mb-2 border border-ink rounded-lg p-3">
                      <p className="font-semibold">{nombreBeneficio(c)}</p>
                      <Select
                        aria-label={`Decision para ${nombreBeneficio(c)}`}
                        value={decision}
                        disabled={resultado === 'RECHAZAR'}
                        onChange={(ev) => cambiar(c, { decision: ev.target.value as DecisionBeneficio })}
                        opciones={[
                          { valor: 'APROBADO', etiqueta: 'Aprobado' },
                          { valor: 'RECHAZADO', etiqueta: 'Rechazado' },
                        ]}
                      />
                      {decision === 'APROBADO' ? (
                        <div className="mt-2">
                          <label className="block text-sm font-semibold" htmlFor={`monto-${c}`}>
                            Monto aprobado en pesos
                          </label>
                          <Input id={`monto-${c}`} type="number" min={0} value={d.monto} onChange={(ev) => cambiar(c, { monto: ev.target.value })} />
                        </div>
                      ) : (
                        <div className="mt-2">
                          <label className="block text-sm font-semibold" htmlFor={`motivo-${c}`}>
                            Motivo del rechazo
                          </label>
                          <Textarea id={`motivo-${c}`} rows={2} value={d.motivo} onChange={(ev) => cambiar(c, { motivo: ev.target.value })} />
                          <p className={d.motivo.trim().length < OBSERVACION_MIN ? 'text-sm text-danger' : 'text-sm'}>
                            {d.motivo.trim().length}/{OBSERVACION_MIN} caracteres minimos
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {resultado === 'APROBAR' && codigos.some((c) => decisionEfectiva(c) === 'RECHAZADO') && (
                  <p className="text-sm">Si rechaza algun beneficio, la aprobacion quedara registrada como parcial.</p>
                )}
              </fieldset>
            )}

            <FormField
              etiqueta="Observaciones para el beneficiario"
              obligatorio={resultado !== 'APROBAR'}
              ayuda={`${observaciones.trim().length} caracteres${resultado !== 'APROBAR' ? ` (minimo ${OBSERVACION_MIN})` : ''}. El beneficiario las vera firmadas por Equipo FOEST.`}
            >
              <Textarea rows={4} value={observaciones} onChange={(ev) => setObservaciones(ev.target.value)} />
            </FormField>

            {resultado === 'CORRECCION' && (
              <>
                <fieldset className="mb-4">
                  <legend className="mb-1 text-sm font-semibold">Campos observados</legend>
                  <div className="space-y-1">
                    {secciones.map((s) => (
                      <Checkbox
                        key={s}
                        etiqueta={TITULOS_SECCION[s as SeccionFormulario] ?? s.replace(/_/g, ' ')}
                        checked={campos.includes(`datos_formulario.${s}`)}
                        onChange={() => toggle(campos, setCampos, `datos_formulario.${s}`)}
                      />
                    ))}
                  </div>
                </fieldset>
                <fieldset className="mb-4">
                  <legend className="mb-1 text-sm font-semibold">Documentos observados</legend>
                  <div className="space-y-1">
                    {e.documentos.map((d) => (
                      <Checkbox key={d.tipo_codigo} etiqueta={d.tipo_nombre} checked={docs.includes(d.tipo_codigo)} onChange={() => toggle(docs, setDocs, d.tipo_codigo)} />
                    ))}
                  </div>
                </fieldset>
                <FormField
                  etiqueta="Fecha limite de subsanacion"
                  ayuda={`Dia habil, maximo ${fechaCorta(e.subsanacion.fecha_limite_maxima)}. Si la deja vacia se aplica el plazo por defecto.`}
                >
                  <Input type="date" value={fecha} max={e.subsanacion.fecha_limite_maxima} onChange={(ev) => setFecha(ev.target.value)} />
                </FormField>
              </>
            )}

            {problemas.length > 0 && (
              <Alert tipo="advertencia" titulo="Pendiente por completar">
                <ul className="list-disc pl-5 text-sm">
                  {problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </>
        ) : (
          <ResumenLegal payload={construir()} expediente={e} />
        )}
      </div>
      {paso === 'edicion' && problemas.length > 0 && (
        <p className="mt-2 text-sm">Complete los datos pendientes para continuar.</p>
      )}
      {paso === 'resumen' && (
        <p className="mt-2 text-sm">
          <button type="button" className="text-primary underline" onClick={() => setPaso('edicion')}>
            Volver a editar
          </button>
        </p>
      )}
    </Modal>
  );
}

function ResumenLegal({ payload: p, expediente: e }: { payload: DictamenInput; expediente: ExpedienteEvaluacionDto }) {
  return (
    <div className="text-sm">
      <p className="mb-2">
        Usted esta a punto de emitir un dictamen sobre la postulacion del ciclo {e.postulacion.ciclo}. Esta decision queda registrada de forma
        permanente y se comunicara al beneficiario con la firma &quot;Equipo FOEST&quot;.
      </p>
      <dl className="grid grid-cols-1 gap-y-1">
        <dt className="font-semibold">Resultado</dt>
        <dd>{TEXTO_RESULTADO[p.resultado]}</dd>
        {p.beneficios.length > 0 && (
          <>
            <dt className="font-semibold">Beneficios</dt>
            <dd>
              <ul className="list-disc pl-5">
                {p.beneficios.map((b) => (
                  <li key={b.codigo}>
                    {nombreBeneficio(b.codigo)}: {b.decision === 'APROBADO' ? 'Aprobado' : 'Rechazado'}
                    {b.monto_aprobado ? ` por ${b.monto_aprobado.toLocaleString('es-CO')} pesos` : ''}
                    {b.motivo ? `. Motivo: ${b.motivo}` : ''}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        <dt className="font-semibold">Observaciones</dt>
        <dd className="whitespace-pre-wrap">{p.observaciones || '-'}</dd>
        {p.resultado === 'CORRECCION' && (
          <>
            <dt className="font-semibold">Campos y documentos observados</dt>
            <dd>{[...(p.campos_observados ?? []), ...(p.documentos_observados ?? [])].join(', ') || '-'}</dd>
            <dt className="font-semibold">Fecha limite de subsanacion</dt>
            <dd>{p.fecha_limite_subsanacion ? fechaCorta(p.fecha_limite_subsanacion) : 'Plazo por defecto del sistema'}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
