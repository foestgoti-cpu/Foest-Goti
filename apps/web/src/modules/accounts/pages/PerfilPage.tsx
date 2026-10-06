import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ESTADOS_CIVILES,
  ESTADO_CIVIL_ETIQUETA,
  GENEROS,
  GENERO_ETIQUETA,
  PARENTESCOS,
  PARENTESCO_ETIQUETA,
  PerfilBeneficiarioSchema,
  SECTORES,
  SolicitudHabeasDataSchema,
  TIPOS_DOCUMENTO_IDENTIDAD,
  TIPOS_SOLICITUD_HABEAS,
  TIPO_SOLICITUD_HABEAS_ETIQUETA,
  esMenorDeEdad,
  type TipoSolicitudHabeas,
} from '@foest/shared';
import type { ZodError } from 'zod';
import { Alert, Badge, Button, Card, Checkbox, FormField, Input, PageHeader, Select, Spinner, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { accountsApi } from '../api';
import { useAceptarConsentimiento, useActualizarPerfil, useHabeasDataPropias, usePerfilPropio, useRadicarHabeasData } from '../hooks/usePerfil';
import { PerfilCompletoBanner } from '../components/PerfilCompletoBanner';
import type { PerfilBeneficiario } from '../types';

interface FormPerfil {
  tipo_documento: string;
  numero_documento: string;
  expedido_en: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  genero: string;
  estado_civil: string;
  direccion: string;
  sector: string;
  celular_1: string;
  celular_2: string;
  correo_notificacion_2: string;
  estrato: string;
  sisben_categoria: string;
  sisben_puntaje: string;
  ac_tipo_documento: string;
  ac_numero_documento: string;
  ac_nombres: string;
  ac_apellidos: string;
  ac_parentesco: string;
  ac_celular: string;
  ac_correo: string;
}

const VACIO: FormPerfil = {
  tipo_documento: '', numero_documento: '', expedido_en: '', nombres: '', apellidos: '', fecha_nacimiento: '', genero: '', estado_civil: '',
  direccion: '', sector: '', celular_1: '', celular_2: '', correo_notificacion_2: '', estrato: '', sisben_categoria: '', sisben_puntaje: '',
  ac_tipo_documento: '', ac_numero_documento: '', ac_nombres: '', ac_apellidos: '', ac_parentesco: '', ac_celular: '', ac_correo: '',
};

function desdePerfil(p: PerfilBeneficiario): FormPerfil {
  const b = p.beneficiario;
  const a = p.acudiente;
  return {
    ...VACIO,
    tipo_documento: b?.tipo_documento ?? '',
    numero_documento: b?.numero_documento ?? '',
    expedido_en: b?.expedido_en ?? '',
    nombres: b?.nombres ?? '',
    apellidos: b?.apellidos ?? '',
    fecha_nacimiento: b?.fecha_nacimiento ?? '',
    genero: b?.genero ?? '',
    estado_civil: b?.estado_civil ?? '',
    direccion: b?.direccion ?? '',
    sector: b?.sector ?? '',
    celular_1: b?.celular_1 ?? '',
    celular_2: b?.celular_2 ?? '',
    correo_notificacion_2: b?.correo_notificacion_2 ?? '',
    estrato: b?.estrato ? String(b.estrato) : '',
    sisben_categoria: b?.sisben_categoria ?? '',
    sisben_puntaje: b?.sisben_puntaje !== null && b?.sisben_puntaje !== undefined ? String(b.sisben_puntaje) : '',
    ac_tipo_documento: a?.tipo_documento ?? '',
    ac_numero_documento: a?.numero_documento ?? '',
    ac_nombres: a?.nombres ?? '',
    ac_apellidos: a?.apellidos ?? '',
    ac_parentesco: a?.parentesco ?? '',
    ac_celular: a?.celular ?? '',
    ac_correo: a?.correo ?? '',
  };
}

const MENSAJES: Record<string, string> = {
  DOCUMENTO_NO_EDITABLE: 'El tipo y numero de documento no se pueden cambiar desde su perfil. Si hay un error, radique una solicitud de rectificacion.',
  DOCUMENTO_DUPLICADO: 'Ya existe una cuenta registrada con ese numero de documento.',
  ACUDIENTE_REQUERIDO: 'Por ser menor de edad debe registrar los datos de su acudiente.',
  PERFIL_ANONIMIZADO: 'Su perfil fue anonimizado y no admite cambios.',
  SUPRESION_NO_PROCEDE: 'No es posible solicitar la supresion mientras tenga postulaciones en tramite.',
  SOLICITUD_EN_TRAMITE: 'Ya tiene una solicitud de este tipo pendiente de respuesta.',
};
const textoError = (e: unknown) => (e instanceof ApiRequestError ? (MENSAJES[e.code] ?? e.message) : e instanceof Error ? e.message : 'Error inesperado.');

/** Mi perfil: seccion 1 del GE-F041, acudiente para menores, consentimiento y derechos de habeas data. */
export function PerfilPage() {
  const perfil = usePerfilPropio();
  const guardar = useActualizarPerfil();
  const aceptar = useAceptarConsentimiento();
  const solicitudes = useHabeasDataPropias();
  const radicar = useRadicarHabeasData();

  const [form, setForm] = useState<FormPerfil>(VACIO);
  const [errores, setErrores] = useState<ZodError | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [tipoSolicitud, setTipoSolicitud] = useState<TipoSolicitudHabeas>('RECTIFICACION');
  const [detalle, setDetalle] = useState('');
  const [erroresSolicitud, setErroresSolicitud] = useState<ZodError | null>(null);
  const [mensajeSolicitud, setMensajeSolicitud] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [aceptaConsentimiento, setAceptaConsentimiento] = useState(false);

  useEffect(() => {
    if (perfil.data) setForm(desdePerfil(perfil.data));
  }, [perfil.data]);

  const esMenor = useMemo(() => esMenorDeEdad(form.fecha_nacimiento || null), [form.fecha_nacimiento]);
  const documentoFijado = Boolean(perfil.data?.beneficiario?.numero_documento);
  const set = (k: keyof FormPerfil) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    const entrada = {
      tipo_documento: form.tipo_documento,
      numero_documento: form.numero_documento,
      expedido_en: form.expedido_en,
      nombres: form.nombres,
      apellidos: form.apellidos,
      fecha_nacimiento: form.fecha_nacimiento,
      genero: form.genero,
      estado_civil: form.estado_civil,
      direccion: form.direccion,
      sector: form.sector,
      celular_1: form.celular_1,
      celular_2: form.celular_2,
      correo_notificacion_2: form.correo_notificacion_2,
      estrato: form.estrato,
      sisben_categoria: form.sisben_categoria,
      sisben_puntaje: form.sisben_puntaje,
      acudiente: esMenor
        ? {
            tipo_documento: form.ac_tipo_documento,
            numero_documento: form.ac_numero_documento,
            nombres: form.ac_nombres,
            apellidos: form.ac_apellidos,
            parentesco: form.ac_parentesco,
            celular: form.ac_celular,
            correo: form.ac_correo,
          }
        : undefined,
    };
    const r = PerfilBeneficiarioSchema.safeParse(entrada);
    if (!r.success) {
      setErrores(r.error);
      setMensaje({ tipo: 'error', texto: 'Revise los campos marcados.' });
      return;
    }
    setErrores(null);
    try {
      await guardar.mutateAsync(r.data);
      setMensaje({ tipo: 'exito', texto: 'Su perfil fue guardado.' });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: textoError(err) });
    }
  };

  const enviarSolicitud = async (e: FormEvent) => {
    e.preventDefault();
    setMensajeSolicitud(null);
    const r = SolicitudHabeasDataSchema.safeParse({ tipo: tipoSolicitud, detalle });
    if (!r.success) return setErroresSolicitud(r.error);
    setErroresSolicitud(null);
    try {
      await radicar.mutateAsync(r.data);
      setDetalle('');
      setMensajeSolicitud({ tipo: 'exito', texto: 'Su solicitud fue radicada. Recibira respuesta por correo.' });
    } catch (err) {
      setMensajeSolicitud({ tipo: 'error', texto: textoError(err) });
    }
  };

  const descargarDatos = async () => {
    try {
      const datos = await accountsApi.exportarDatosPropios();
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mis-datos-foest.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMensajeSolicitud({ tipo: 'error', texto: textoError(err) });
    }
  };

  if (perfil.isLoading) return <Spinner etiqueta="Cargando su perfil" />;
  if (perfil.error) return <Alert tipo="error">{textoError(perfil.error)}</Alert>;
  const p = perfil.data;

  return (
    <>
      <PageHeader titulo="Mi perfil" descripcion="Informacion personal del formato GE-F041 (seccion 1). Debe estar completa para enviar una postulacion." />
      {p && (
        <div className="mb-4">
          <PerfilCompletoBanner completo={p.perfil_completo} faltantes={p.campos_faltantes} />
        </div>
      )}
      {mensaje && (
        <Alert tipo={mensaje.tipo} className="mb-4">
          {mensaje.texto}
        </Alert>
      )}
      <form onSubmit={(e) => void enviar(e)} noValidate>
        <Card titulo="Identificacion" className="mb-4">
          <div className="grid gap-x-6 md:grid-cols-2">
            <FormField etiqueta="Tipo de documento" nombre="tipo_documento" error={errores} obligatorio ayuda={documentoFijado ? 'Para corregirlo radique una solicitud de rectificacion.' : undefined}>
              <Select value={form.tipo_documento} onChange={set('tipo_documento')} disabled={documentoFijado} placeholder="Seleccione" opciones={TIPOS_DOCUMENTO_IDENTIDAD.map((t) => ({ valor: t, etiqueta: t }))} />
            </FormField>
            <FormField etiqueta="Numero de documento" nombre="numero_documento" error={errores} obligatorio>
              <Input value={form.numero_documento} onChange={set('numero_documento')} disabled={documentoFijado} inputMode="numeric" />
            </FormField>
            <FormField etiqueta="Lugar de expedicion" nombre="expedido_en" error={errores} obligatorio>
              <Input value={form.expedido_en} onChange={set('expedido_en')} />
            </FormField>
            <FormField etiqueta="Fecha de nacimiento" nombre="fecha_nacimiento" error={errores} obligatorio>
              <Input type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} />
            </FormField>
            <FormField etiqueta="Nombres" nombre="nombres" error={errores} obligatorio>
              <Input value={form.nombres} onChange={set('nombres')} />
            </FormField>
            <FormField etiqueta="Apellidos" nombre="apellidos" error={errores} obligatorio>
              <Input value={form.apellidos} onChange={set('apellidos')} />
            </FormField>
            <FormField etiqueta="Genero" nombre="genero" error={errores} obligatorio>
              <Select value={form.genero} onChange={set('genero')} placeholder="Seleccione" opciones={GENEROS.map((g) => ({ valor: g, etiqueta: GENERO_ETIQUETA[g] }))} />
            </FormField>
            <FormField etiqueta="Estado civil" nombre="estado_civil" error={errores} obligatorio>
              <Select value={form.estado_civil} onChange={set('estado_civil')} placeholder="Seleccione" opciones={ESTADOS_CIVILES.map((g) => ({ valor: g, etiqueta: ESTADO_CIVIL_ETIQUETA[g] }))} />
            </FormField>
          </div>
          {form.fecha_nacimiento && (
            <p className="text-sm">
              <Badge tono={esMenor ? 'destacado' : 'neutro'}>{esMenor ? 'Menor de edad: se requiere acudiente' : 'Mayor de edad'}</Badge>
            </p>
          )}
        </Card>

        <Card titulo="Contacto y residencia" className="mb-4">
          <div className="grid gap-x-6 md:grid-cols-2">
            <FormField etiqueta="Celular principal" nombre="celular_1" error={errores} obligatorio ayuda="10 digitos, inicia por 3.">
              <Input value={form.celular_1} onChange={set('celular_1')} inputMode="tel" />
            </FormField>
            <FormField etiqueta="Celular alterno" nombre="celular_2" error={errores}>
              <Input value={form.celular_2} onChange={set('celular_2')} inputMode="tel" />
            </FormField>
            <FormField etiqueta="Correo de la cuenta" nombre="email">
              <Input value={p?.email ?? ''} disabled readOnly />
            </FormField>
            <FormField etiqueta="Correo alternativo" nombre="correo_notificacion_2" error={errores} obligatorio ayuda="Segundo correo para notificaciones.">
              <Input type="email" value={form.correo_notificacion_2} onChange={set('correo_notificacion_2')} />
            </FormField>
            <FormField etiqueta="Direccion de residencia" nombre="direccion" error={errores} obligatorio>
              <Input value={form.direccion} onChange={set('direccion')} />
            </FormField>
            <FormField etiqueta="Sector" nombre="sector" error={errores} obligatorio>
              <Select value={form.sector} onChange={set('sector')} placeholder="Seleccione" opciones={SECTORES.map((s) => ({ valor: s, etiqueta: s }))} />
            </FormField>
          </div>
        </Card>

        <Card titulo="Condicion socioeconomica" className="mb-4">
          <div className="grid gap-x-6 md:grid-cols-3">
            <FormField etiqueta="Estrato" nombre="estrato" error={errores} obligatorio>
              <Select value={form.estrato} onChange={set('estrato')} placeholder="Seleccione" opciones={['1', '2', '3', '4', '5', '6'].map((n) => ({ valor: n, etiqueta: `Estrato ${n}` }))} />
            </FormField>
            <FormField etiqueta="Categoria SISBEN" nombre="sisben_categoria" error={errores} ayuda="Ejemplo: B3">
              <Input value={form.sisben_categoria} onChange={set('sisben_categoria')} />
            </FormField>
            <FormField etiqueta="Puntaje SISBEN" nombre="sisben_puntaje" error={errores}>
              <Input value={form.sisben_puntaje} onChange={set('sisben_puntaje')} inputMode="decimal" />
            </FormField>
          </div>
        </Card>

        {esMenor && (
          <Card titulo="Acudiente (obligatorio para menores de edad)" className="mb-4" data-testid="bloque-acudiente">
            <div className="grid gap-x-6 md:grid-cols-2">
              <FormField etiqueta="Tipo de documento" nombre="acudiente.tipo_documento" error={errores} obligatorio>
                <Select value={form.ac_tipo_documento} onChange={set('ac_tipo_documento')} placeholder="Seleccione" opciones={TIPOS_DOCUMENTO_IDENTIDAD.map((t) => ({ valor: t, etiqueta: t }))} />
              </FormField>
              <FormField etiqueta="Numero de documento" nombre="acudiente.numero_documento" error={errores} obligatorio>
                <Input value={form.ac_numero_documento} onChange={set('ac_numero_documento')} />
              </FormField>
              <FormField etiqueta="Nombres" nombre="acudiente.nombres" error={errores} obligatorio>
                <Input value={form.ac_nombres} onChange={set('ac_nombres')} />
              </FormField>
              <FormField etiqueta="Apellidos" nombre="acudiente.apellidos" error={errores} obligatorio>
                <Input value={form.ac_apellidos} onChange={set('ac_apellidos')} />
              </FormField>
              <FormField etiqueta="Parentesco" nombre="acudiente.parentesco" error={errores} obligatorio>
                <Select value={form.ac_parentesco} onChange={set('ac_parentesco')} placeholder="Seleccione" opciones={PARENTESCOS.map((x) => ({ valor: x, etiqueta: PARENTESCO_ETIQUETA[x] }))} />
              </FormField>
              <FormField etiqueta="Celular" nombre="acudiente.celular" error={errores} obligatorio>
                <Input value={form.ac_celular} onChange={set('ac_celular')} inputMode="tel" />
              </FormField>
              <FormField etiqueta="Correo" nombre="acudiente.correo" error={errores} obligatorio ayuda="Las notificaciones tambien se envian a este correo.">
                <Input type="email" value={form.ac_correo} onChange={set('ac_correo')} />
              </FormField>
            </div>
            {errores && <p className="text-sm">{errores.issues.find((i) => i.path.join('.') === 'acudiente')?.message}</p>}
          </Card>
        )}

        <div className="mb-6 flex gap-2">
          <Button type="submit" cargando={guardar.isPending}>
            Guardar perfil
          </Button>
        </div>
      </form>

      <Card titulo="Consentimiento de tratamiento de datos" className="mb-4">
        {p?.consentimiento_vigente.aceptado ? (
          <p>
            Usted acepto la version {p.consentimiento_vigente.version} del texto de tratamiento de datos personales (Ley 1581 de 2012)
            {p.consentimiento_vigente.aceptado_en ? ` el ${new Date(p.consentimiento_vigente.aceptado_en).toLocaleString('es-CO')}` : ''}.
          </p>
        ) : (
          <>
            <Alert tipo="advertencia" className="mb-3">
              Debe aceptar la version vigente ({p?.consentimiento_vigente.version}) del texto de tratamiento de datos para completar su perfil.
            </Alert>
            <Checkbox
              etiqueta="Acepto el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y la politica del FOEST."
              descripcion={p?.es_menor ? 'Por ser menor de edad, el consentimiento se registra con los datos de su acudiente. Guarde primero su perfil.' : undefined}
              checked={aceptaConsentimiento}
              onChange={(e) => setAceptaConsentimiento(e.target.checked)}
            />
            <Button
              className="mt-3"
              variante="secundario"
              disabled={!aceptaConsentimiento}
              cargando={aceptar.isPending}
              onClick={async () => {
                try {
                  await aceptar.mutateAsync();
                  setMensaje({ tipo: 'exito', texto: 'Su consentimiento fue registrado.' });
                } catch (err) {
                  setMensaje({ tipo: 'error', texto: textoError(err) });
                }
              }}
            >
              Registrar consentimiento
            </Button>
          </>
        )}
      </Card>

      <Card titulo="Mis datos (habeas data)">
        <p className="mb-3 text-sm">
          Usted puede conocer, actualizar, rectificar y solicitar la supresion de sus datos personales. La rectificacion de los campos editables se hace directamente en este perfil; el documento de identidad y la supresion requieren una solicitud.
        </p>
        <Button variante="secundario" onClick={() => void descargarDatos()}>
          Descargar mis datos
        </Button>
        {mensajeSolicitud && (
          <Alert tipo={mensajeSolicitud.tipo} className="my-3">
            {mensajeSolicitud.texto}
          </Alert>
        )}
        <form onSubmit={(e) => void enviarSolicitud(e)} noValidate className="mt-4 border-t border-ink pt-4">
          <FormField etiqueta="Tipo de solicitud" nombre="tipo" error={erroresSolicitud} obligatorio>
            <Select value={tipoSolicitud} onChange={(e) => setTipoSolicitud(e.target.value as TipoSolicitudHabeas)} opciones={TIPOS_SOLICITUD_HABEAS.map((t) => ({ valor: t, etiqueta: TIPO_SOLICITUD_HABEAS_ETIQUETA[t] }))} />
          </FormField>
          <FormField etiqueta="Detalle de la solicitud" nombre="detalle" error={erroresSolicitud} obligatorio>
            <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} />
          </FormField>
          <Button type="submit" variante="secundario" cargando={radicar.isPending}>
            Radicar solicitud
          </Button>
        </form>
        {(solicitudes.data?.data.length ?? 0) > 0 && (
          <ul className="mt-4 border-t border-ink pt-3 text-sm">
            {solicitudes.data?.data.map((s) => (
              <li key={s.id} className="border-b border-ink/30 py-2">
                <strong>{TIPO_SOLICITUD_HABEAS_ETIQUETA[s.tipo]}</strong> - {new Date(s.creada_en).toLocaleDateString('es-CO')} -{' '}
                {s.estado === 'RADICADA' ? 'En tramite' : s.estado === 'RESUELTA' ? 'Resuelta' : 'Rechazada'}
                {s.motivo_resolucion ? `: ${s.motivo_resolucion}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
