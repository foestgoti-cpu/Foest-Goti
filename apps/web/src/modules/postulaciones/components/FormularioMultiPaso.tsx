import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BENEFICIOS_CATALOGO,
  MODALIDADES_PROGRAMA,
  SITUACIONES_LABORALES,
  TIPOS_PAGO_ST,
  TITULOS_SECCION,
  seccionesAplicables,
  type CodigoBeneficio,
  type SeccionFormulario,
} from '@foest/shared';
import { Alert, Button, Card, Checkbox, FormField, Input, Select, Spinner } from '../../../components/ui';
import { api } from '../../../lib/api';
import { IesProgramaSelect, type SeleccionSnies } from '../../catalogos_configuracion/components/IesProgramaSelect';
import { BarraProgreso } from './BarraProgreso';
import { ChecklistValidacion } from './ChecklistValidacion';
import { PasoDocumentos } from '../../documentos/components/PasoDocumentos';
import { DeclaracionesPaso } from './DeclaracionesPaso';
import { pesos, TEXTO_MODALIDAD, TEXTO_SITUACION_LABORAL, TEXTO_TIPO_PAGO } from '../formato';
import type { GuardarPayload, Postulacion, Validacion } from '../types';

type SeccionDatos = Exclude<SeccionFormulario, 'seccion_1' | 'seccion_2'>;
type Datos = Record<string, Record<string, unknown>>;
/** Pasos del asistente: las secciones del GE-F041 y el paso de soportes (antes de las declaraciones). */
type Paso = SeccionFormulario | 'documentos';

export interface FormularioMultiPasoProps {
  postulacion: Postulacion;
  validacion: Validacion | undefined;
  guardando: boolean;
  errorGuardado: string | null;
  onGuardar: (payload: Omit<GuardarPayload, 'version'>) => Promise<unknown>;
  onEnviar: () => void;
}

const DEBOUNCE_MS = 1200;

function limpiar(valores: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valores)) {
    if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const anidado = limpiar(v as Record<string, unknown>);
      if (Object.keys(anidado).length > 0) salida[k] = anidado;
      continue;
    }
    salida[k] = v;
  }
  return salida;
}

/** Wizard de las 9 secciones del GE-F041 con autoguardado por seccion y control de version. */
export function FormularioMultiPaso({ postulacion, validacion, guardando, errorGuardado, onGuardar, onEnviar }: FormularioMultiPasoProps) {
  const enCorreccion = postulacion.estado === 'EN_CORRECCION';
  const esBorrador = postulacion.estado === 'BORRADOR';
  const soloLectura = !esBorrador && !enCorreccion;
  const camposObservados = postulacion.correccion_vigente?.campos_observados ?? [];

  const [datos, setDatos] = useState<Datos>(() => ({ ...(postulacion.datos_formulario as Datos) }));
  const [beneficios, setBeneficios] = useState<CodigoBeneficio[]>(postulacion.beneficios);
  const secciones = useMemo(() => seccionesAplicables(postulacion.tipo_solicitud, beneficios), [postulacion.tipo_solicitud, beneficios]);
  const pasos = useMemo<Paso[]>(() => {
    const lista: Paso[] = [...secciones];
    const i = lista.indexOf('seccion_9');
    if (i >= 0) lista.splice(i, 0, 'documentos');
    else lista.push('documentos');
    return lista;
  }, [secciones]);
  const [indice, setIndice] = useState(0);
  const seccionActual: Paso = pasos[Math.min(indice, pasos.length - 1)] ?? 'seccion_1';
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null);
  const [seleccionSnies, setSeleccionSnies] = useState<SeleccionSnies>({ ies: null, programa: null });

  // Sincroniza con el servidor cuando cambia la version (p. ej. tras recargar por conflicto).
  const versionRef = useRef(postulacion.version);
  useEffect(() => {
    if (postulacion.version !== versionRef.current) {
      versionRef.current = postulacion.version;
      setDatos({ ...(postulacion.datos_formulario as Datos) });
      setBeneficios(postulacion.beneficios);
    }
  }, [postulacion.version, postulacion.datos_formulario, postulacion.beneficios]);

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendientes = useRef<Record<string, Record<string, unknown>>>({});

  const programarGuardado = useCallback(
    (seccion: SeccionDatos, valores: Record<string, unknown>) => {
      pendientes.current[seccion] = { ...(pendientes.current[seccion] ?? {}), ...valores };
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        const cuerpo: Record<string, Record<string, unknown>> = {};
        for (const [s, v] of Object.entries(pendientes.current)) cuerpo[s] = limpiar(v);
        pendientes.current = {};
        void onGuardar({ datos_formulario: cuerpo as GuardarPayload['datos_formulario'] }).then(() => setGuardadoEn(new Date().toISOString()), () => undefined);
      }, DEBOUNCE_MS);
    },
    [onGuardar],
  );
  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const editable = useCallback(
    (seccion: SeccionFormulario, campo?: string): boolean => {
      if (esBorrador) return true;
      if (!enCorreccion) return false;
      const ruta = campo ? `${seccion}.${campo}` : seccion;
      return camposObservados.some((c) => c === ruta || ruta.startsWith(`${c}.`) || c.startsWith(`${ruta}.`));
    },
    [esBorrador, enCorreccion, camposObservados],
  );

  const cambiar = (seccion: SeccionDatos, campo: string, valor: unknown) => {
    setDatos((d) => ({ ...d, [seccion]: { ...(d[seccion] ?? {}), [campo]: valor } }));
    programarGuardado(seccion, { [campo]: valor });
  };
  const cambiarAnidado = (seccion: SeccionDatos, grupo: string, campo: string, valor: unknown) => {
    const actualGrupo = { ...((datos[seccion]?.[grupo] as Record<string, unknown> | undefined) ?? {}), [campo]: valor };
    setDatos((d) => ({ ...d, [seccion]: { ...(d[seccion] ?? {}), [grupo]: actualGrupo } }));
    programarGuardado(seccion, { [grupo]: actualGrupo });
  };

  const valor = (seccion: SeccionDatos, campo: string): string => {
    const v = datos[seccion]?.[campo];
    return v === undefined || v === null ? '' : String(v);
  };
  const valorAnidado = (seccion: SeccionDatos, grupo: string, campo: string): string => {
    const g = datos[seccion]?.[grupo] as Record<string, unknown> | undefined;
    const v = g?.[campo];
    return v === undefined || v === null ? '' : String(v);
  };
  const numero = (texto: string): number | undefined => (texto.trim() === '' ? undefined : Number(texto));

  const errorCampo = (seccion: SeccionFormulario, campo: string): string | null =>
    validacion?.campos_faltantes.find((c) => c.seccion === seccion && c.campo === campo && valor(seccion as SeccionDatos, campo.split('.')[0] ?? '') !== '')?.mensaje ?? null;

  // --- Beneficios (seccion 2; solo en BORRADOR) ---
  const alternarBeneficio = (codigo: CodigoBeneficio, marcado: boolean) => {
    const nuevos = marcado ? [...new Set([...beneficios, codigo])] : beneficios.filter((b) => b !== codigo);
    setBeneficios(nuevos);
    void onGuardar({ beneficios: nuevos }).then(() => setGuardadoEn(new Date().toISOString()), () => undefined);
  };

  // --- Declaraciones (seccion 9) ---
  const vigentes = validacion?.declaraciones.vigentes ?? [];
  const aceptadas = useMemo(() => {
    const lista = (datos.seccion_9?.declaraciones as Array<{ codigo: string; version: number; aceptada: boolean }> | undefined) ?? [];
    return vigentes.filter((v) => lista.some((a) => a.codigo === v.codigo && a.version === v.version && a.aceptada)).map((v) => v.codigo);
  }, [datos.seccion_9, vigentes]);
  const cambiarDeclaracion = (codigo: string, marcado: boolean) => {
    const nuevas = vigentes.map((v) => ({ codigo: v.codigo, version: v.version, aceptada: v.codigo === codigo ? marcado : aceptadas.includes(v.codigo) }));
    setDatos((d) => ({ ...d, seccion_9: { declaraciones: nuevas } }));
    programarGuardado('seccion_9', { declaraciones: nuevas });
  };

  // --- Datos de pago (seccion 8) ---
  const [pago, setPago] = useState({ tipo: '', entidad: '', numero: '' });
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const guardarPago = async () => {
    setErrorPago(null);
    if (!pago.tipo || !pago.entidad.trim() || !/^\d{6,24}$/.test(pago.numero.trim())) {
      setErrorPago('Indique el tipo, la entidad y un numero de 6 a 24 digitos.');
      return;
    }
    try {
      await onGuardar({ datos_pago: { tipo: pago.tipo as 'CUENTA_BANCARIA' | 'BILLETERA', entidad: pago.entidad.trim(), numero: pago.numero.trim() } });
      setPago({ tipo: '', entidad: '', numero: '' });
      setGuardadoEn(new Date().toISOString());
    } catch (e) {
      setErrorPago((e as Error).message);
    }
  };

  // --- Seccion 1: perfil de solo lectura (modulo accounts) ---
  const perfil = useQuery({
    queryKey: ['postulaciones', 'perfil-lectura'],
    queryFn: () => api.get<Record<string, unknown>>('/beneficiarios/me'),
    enabled: seccionActual === 'seccion_1',
    retry: false,
  });

  const irA = (s: Paso) => setIndice(Math.max(0, pasos.indexOf(s)));
  const esUltima = indice >= pasos.length - 1;
  const documentosCompletos = Boolean(validacion && !validacion.documentos.pendiente_modulo && validacion.documentos.faltantes.length === 0);

  const ofertados = postulacion.convocatoria?.beneficios_ofertados ?? beneficios;
  const pagoActual = datos.seccion_8?.datos_pago as { tipo: string; entidad: string; numero_enmascarado: string } | undefined;

  const deshabilitado = (seccion: SeccionFormulario, campo: string) => soloLectura || !editable(seccion, campo);

  return (
    <div>
      <BarraProgreso
        secciones={pasos}
        completas={[...(validacion?.secciones_completas ?? []), ...(documentosCompletos ? (['documentos'] as const) : [])]}
        actual={seccionActual}
        onIr={irA}
      />

      {enCorreccion && (
        <Alert tipo="advertencia" className="mb-4" titulo="Correccion solicitada por el Equipo FOEST">
          <p>{postulacion.correccion_vigente?.observaciones ?? 'Revise los campos habilitados y envie la subsanacion.'}</p>
          {camposObservados.length > 0 && <p className="mt-1 text-sm">Campos habilitados: {camposObservados.join(', ')}</p>}
        </Alert>
      )}
      {soloLectura && (
        <Alert tipo="info" className="mb-4">
          La postulacion ya fue enviada; el formulario se muestra en modo de consulta.
        </Alert>
      )}

      <Card
        titulo={`${pasos.indexOf(seccionActual) + 1}. ${seccionActual === 'documentos' ? 'Documentos de soporte' : TITULOS_SECCION[seccionActual]}`}
        acciones={
          <span className="text-sm" aria-live="polite">
            {guardando ? <Spinner etiqueta="Guardando" /> : guardadoEn ? `Guardado ${new Date(guardadoEn).toLocaleTimeString('es-CO')}` : null}
          </span>
        }
      >
        {errorGuardado && (
          <Alert tipo="error" className="mb-4">
            {errorGuardado}
          </Alert>
        )}

        {seccionActual === 'seccion_1' && (
          <div>
            <p className="mb-3 text-sm">Estos datos provienen de su perfil y se congelan al enviar. Para corregirlos vaya a Mi perfil.</p>
            {perfil.isLoading && <Spinner />}
            {perfil.isError && <Alert tipo="advertencia">No fue posible cargar su perfil en este momento. Verifiquelo en Mi perfil.</Alert>}
            {perfil.data && (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {Object.entries(perfil.data)
                  .filter(([k, v]) => typeof v !== 'object' && !['id', 'usuario_id', 'anonimizado', 'anonimizado_en', 'creado_en', 'actualizado_en'].includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="border-b border-ink/30 pb-1">
                      <dt className="font-semibold">{k.replace(/_/g, ' ')}</dt>
                      <dd>{v === null || v === undefined || v === '' ? '-' : String(v)}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </div>
        )}

        {seccionActual === 'seccion_2' && (
          <div>
            <p className="mb-3 text-sm">Seleccione los beneficios que solicita en esta convocatoria.</p>
            {!esBorrador && <p className="mb-3 text-sm">Los beneficios solicitados no se pueden modificar despues del envio.</p>}
            <div className="space-y-2">
              {ofertados.map((codigo) => {
                const b = BENEFICIOS_CATALOGO.find((c) => c.codigo === codigo);
                return (
                  <Checkbox
                    key={codigo}
                    etiqueta={`${b?.nombre ?? codigo} (${codigo})`}
                    checked={beneficios.includes(codigo)}
                    disabled={!esBorrador || guardando}
                    onChange={(e) => alternarBeneficio(codigo, e.target.checked)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {seccionActual === 'seccion_3' && (
          <div>
            <FormField etiqueta="Personas a cargo" nombre="personas_a_cargo" obligatorio error={errorCampo('seccion_3', 'personas_a_cargo')}>
              <Input type="number" min={0} max={20} value={valor('seccion_3', 'personas_a_cargo')} disabled={deshabilitado('seccion_3', 'personas_a_cargo')} onChange={(e) => cambiar('seccion_3', 'personas_a_cargo', numero(e.target.value))} />
            </FormField>
            <FormField etiqueta="Situacion laboral" nombre="situacion_laboral" obligatorio>
              <Select
                placeholder="Seleccione"
                opciones={SITUACIONES_LABORALES.map((s) => ({ valor: s, etiqueta: TEXTO_SITUACION_LABORAL[s] ?? s }))}
                value={valor('seccion_3', 'situacion_laboral')}
                disabled={deshabilitado('seccion_3', 'situacion_laboral')}
                onChange={(e) => cambiar('seccion_3', 'situacion_laboral', e.target.value || undefined)}
              />
            </FormField>
            <h3 className="mb-2 mt-4">Contacto de emergencia</h3>
            <FormField etiqueta="Nombre completo" nombre="contacto_nombre" obligatorio>
              <Input value={valorAnidado('seccion_3', 'contacto_emergencia', 'nombre')} disabled={deshabilitado('seccion_3', 'contacto_emergencia')} onChange={(e) => cambiarAnidado('seccion_3', 'contacto_emergencia', 'nombre', e.target.value)} />
            </FormField>
            <FormField etiqueta="Parentesco" nombre="contacto_parentesco" obligatorio>
              <Input value={valorAnidado('seccion_3', 'contacto_emergencia', 'parentesco')} disabled={deshabilitado('seccion_3', 'contacto_emergencia')} onChange={(e) => cambiarAnidado('seccion_3', 'contacto_emergencia', 'parentesco', e.target.value)} />
            </FormField>
            <FormField etiqueta="Telefono" nombre="contacto_telefono" obligatorio ayuda="Entre 7 y 10 digitos, sin espacios.">
              <Input inputMode="numeric" value={valorAnidado('seccion_3', 'contacto_emergencia', 'telefono')} disabled={deshabilitado('seccion_3', 'contacto_emergencia')} onChange={(e) => cambiarAnidado('seccion_3', 'contacto_emergencia', 'telefono', e.target.value.replace(/\D/g, ''))} />
            </FormField>
          </div>
        )}

        {seccionActual === 'seccion_4' && (
          <div>
            <IesProgramaSelect
              valor={seleccionSnies}
              deshabilitado={deshabilitado('seccion_4', 'snies_codigo')}
              onChange={(sel) => {
                setSeleccionSnies(sel);
                // Autocompleta los campos del esquema actual (siguen editables si el catalogo no lista el programa).
                if (sel.programa) {
                  cambiar('seccion_4', 'snies_codigo', sel.programa.codigo_snies);
                  cambiar('seccion_4', 'programa', sel.programa.nombre);
                }
                if (sel.ies) cambiar('seccion_4', 'institucion', sel.ies.nombre);
              }}
            />
            <FormField etiqueta="Codigo SNIES del programa" nombre="snies_codigo" obligatorio ayuda="Consulte el codigo en el SNIES del Ministerio de Educacion.">
              <Input inputMode="numeric" value={valor('seccion_4', 'snies_codigo')} disabled={deshabilitado('seccion_4', 'snies_codigo')} onChange={(e) => cambiar('seccion_4', 'snies_codigo', e.target.value.replace(/\D/g, ''))} />
            </FormField>
            <FormField etiqueta="Institucion de educacion superior" nombre="institucion" obligatorio>
              <Input value={valor('seccion_4', 'institucion')} disabled={deshabilitado('seccion_4', 'institucion')} onChange={(e) => cambiar('seccion_4', 'institucion', e.target.value)} />
            </FormField>
            <FormField etiqueta="Programa academico" nombre="programa" obligatorio>
              <Input value={valor('seccion_4', 'programa')} disabled={deshabilitado('seccion_4', 'programa')} onChange={(e) => cambiar('seccion_4', 'programa', e.target.value)} />
            </FormField>
            <FormField etiqueta="Semestre que ingresa o cursa" nombre="semestre" obligatorio>
              <Input type="number" min={1} max={20} value={valor('seccion_4', 'semestre')} disabled={deshabilitado('seccion_4', 'semestre')} onChange={(e) => cambiar('seccion_4', 'semestre', numero(e.target.value))} />
            </FormField>
            <FormField etiqueta="Modalidad" nombre="modalidad" obligatorio>
              <Select
                placeholder="Seleccione"
                opciones={MODALIDADES_PROGRAMA.map((m) => ({ valor: m, etiqueta: TEXTO_MODALIDAD[m] ?? m }))}
                value={valor('seccion_4', 'modalidad')}
                disabled={deshabilitado('seccion_4', 'modalidad')}
                onChange={(e) => cambiar('seccion_4', 'modalidad', e.target.value || undefined)}
              />
            </FormField>
          </div>
        )}

        {seccionActual === 'seccion_5' && (
          <div>
            <FormField etiqueta="Colegio de Tocancipa donde se graduo" nombre="colegio" obligatorio>
              <Input value={valor('seccion_5', 'colegio')} disabled={deshabilitado('seccion_5', 'colegio')} onChange={(e) => cambiar('seccion_5', 'colegio', e.target.value)} />
            </FormField>
            <FormField etiqueta="Ano de graduacion" nombre="anio_graduacion" obligatorio>
              <Input type="number" min={1990} max={2100} value={valor('seccion_5', 'anio_graduacion')} disabled={deshabilitado('seccion_5', 'anio_graduacion')} onChange={(e) => cambiar('seccion_5', 'anio_graduacion', numero(e.target.value))} />
            </FormField>
            <FormField etiqueta="Registro Saber 11 / ICFES" nombre="registro_saber11" obligatorio>
              <Input value={valor('seccion_5', 'registro_saber11')} disabled={deshabilitado('seccion_5', 'registro_saber11')} onChange={(e) => cambiar('seccion_5', 'registro_saber11', e.target.value)} />
            </FormField>
          </div>
        )}

        {seccionActual === 'seccion_6' && (
          <div>
            {(
              [
                ['promedio_semestre_anterior', 'Promedio del semestre anterior (0 a 5)', 0.01],
                ['promedio_acumulado', 'Promedio acumulado (0 a 5)', 0.01],
                ['creditos_cursados', 'Creditos o materias cursadas', 1],
                ['creditos_aprobados', 'Creditos o materias aprobadas', 1],
                ['creditos_perdidos', 'Creditos o materias perdidas', 1],
              ] as const
            ).map(([campo, etiqueta, paso]) => (
              <FormField key={campo} etiqueta={etiqueta} nombre={campo} obligatorio>
                <Input type="number" step={paso} min={0} value={valor('seccion_6', campo)} disabled={deshabilitado('seccion_6', campo)} onChange={(e) => cambiar('seccion_6', campo, numero(e.target.value))} />
              </FormField>
            ))}
          </div>
        )}

        {seccionActual === 'seccion_7' && (
          <div>
            <FormField etiqueta="Valor de la matricula ordinaria (COP, sin decimales)" nombre="valor_matricula" obligatorio>
              <Input type="number" min={1} step={1} inputMode="numeric" value={valor('seccion_7', 'valor_matricula')} disabled={deshabilitado('seccion_7', 'valor_matricula')} onChange={(e) => cambiar('seccion_7', 'valor_matricula', numero(e.target.value))} />
            </FormField>
            <p className="text-sm">
              Valor: {pesos(Number(valor('seccion_7', 'valor_matricula')) || null)}
              {postulacion.valor_matricula_letras && (
                <span className="mt-1 block">
                  En letras (generado por el sistema): <span className="uppercase">{postulacion.valor_matricula_letras}</span>
                </span>
              )}
            </p>
          </div>
        )}

        {seccionActual === 'seccion_8' && (
          <div>
            <FormField etiqueta="Dias de asistencia por semana" nombre="dias_asistencia_semanal" obligatorio>
              <Input type="number" min={1} max={7} value={valor('seccion_8', 'dias_asistencia_semanal')} disabled={deshabilitado('seccion_8', 'dias_asistencia_semanal')} onChange={(e) => cambiar('seccion_8', 'dias_asistencia_semanal', numero(e.target.value))} />
            </FormField>
            <FormField etiqueta="Municipio de destino" nombre="municipio_destino" obligatorio>
              <Input value={valor('seccion_8', 'municipio_destino')} disabled={deshabilitado('seccion_8', 'municipio_destino')} onChange={(e) => cambiar('seccion_8', 'municipio_destino', e.target.value)} />
            </FormField>
            <h3 className="mb-2 mt-4">Datos de pago del subsidio</h3>
            <p className="mb-2 text-sm">
              {pagoActual
                ? `Registrado: ${TEXTO_TIPO_PAGO[pagoActual.tipo] ?? pagoActual.tipo} en ${pagoActual.entidad}, numero ${pagoActual.numero_enmascarado}.`
                : 'Aun no ha registrado datos de pago.'}{' '}
              El numero se guarda cifrado y solo se muestran los ultimos cuatro digitos.
            </p>
            {!deshabilitado('seccion_8', 'datos_pago') && (
              <div className="border border-ink p-3">
                <FormField etiqueta="Tipo" nombre="pago_tipo" obligatorio>
                  <Select placeholder="Seleccione" opciones={TIPOS_PAGO_ST.map((t) => ({ valor: t, etiqueta: TEXTO_TIPO_PAGO[t] ?? t }))} value={pago.tipo} onChange={(e) => setPago({ ...pago, tipo: e.target.value })} />
                </FormField>
                <FormField etiqueta="Entidad" nombre="pago_entidad" obligatorio>
                  <Input value={pago.entidad} onChange={(e) => setPago({ ...pago, entidad: e.target.value })} />
                </FormField>
                <FormField etiqueta="Numero de cuenta o billetera" nombre="pago_numero" obligatorio error={errorPago}>
                  <Input inputMode="numeric" autoComplete="off" value={pago.numero} onChange={(e) => setPago({ ...pago, numero: e.target.value.replace(/\D/g, '') })} />
                </FormField>
                <Button variante="secundario" onClick={() => void guardarPago()} cargando={guardando}>
                  Guardar datos de pago
                </Button>
              </div>
            )}
          </div>
        )}

        {seccionActual === 'documentos' && <PasoDocumentos postulacionId={postulacion.id} />}

        {seccionActual === 'seccion_9' && (
          <div className="space-y-6">
            <DeclaracionesPaso declaraciones={vigentes} aceptadas={aceptadas} onCambiar={cambiarDeclaracion} deshabilitado={soloLectura} />
            {validacion && <ChecklistValidacion validacion={validacion} onIrSeccion={irA} onIrDocumentos={() => irA('documentos')} />}
          </div>
        )}
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variante="secundario" disabled={indice === 0} onClick={() => setIndice((i) => Math.max(0, i - 1))}>
          Anterior
        </Button>
        {!esUltima ? (
          <Button onClick={() => setIndice((i) => Math.min(pasos.length - 1, i + 1))}>Siguiente</Button>
        ) : (
          !soloLectura && (
            <Button onClick={onEnviar} disabled={!validacion?.completo || guardando}>
              {enCorreccion ? 'Enviar subsanacion' : 'Enviar postulacion'}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
