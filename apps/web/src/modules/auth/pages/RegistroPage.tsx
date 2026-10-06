import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { TIPOS_DOCUMENTO_IDENTIDAD } from '@foest/shared';
import type { ZodError } from 'zod';
import { Card, FormField, Input, Select, Button, Alert, Checkbox, Spinner } from '../../../components/ui';
import { authApi, mensajeDeErrorApi, type RegistroPayload } from '../api';
import { useConsentimientoVigente } from '../hooks/useConsentimientoVigente';
import { AYUDA_PASSWORD, RegistroFormSchema, esMenorDeEdad } from '../types';

const OPCIONES_DOCUMENTO = TIPOS_DOCUMENTO_IDENTIDAD.map((t) => ({ valor: t, etiqueta: t }));

/**
 * Registro publico de BENEFICIARIO (POST /auth/register): datos minimos de
 * identificacion, contrasena segun politica, consentimiento obligatorio con el
 * texto vigente (GET /auth/consentimiento/vigente) y acudiente si es menor de edad.
 */
export function RegistroPage() {
  const consentimiento = useConsentimientoVigente();
  const [campos, setCampos] = useState({
    nombres: '',
    apellidos: '',
    email: '',
    fecha_nacimiento: '',
    tipo_documento: '',
    numero_documento: '',
    password: '',
    confirmar_password: '',
  });
  const [acudiente, setAcudiente] = useState({ nombre: '', tipo_documento: '', numero_documento: '', correo: '' });
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<ZodError | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [registrado, setRegistrado] = useState(false);

  const esMenor = esMenorDeEdad(campos.fecha_nacimiento);
  const actualizar = (clave: keyof typeof campos) => (valor: string) => setCampos((c) => ({ ...c, [clave]: valor }));
  const actualizarAcudiente = (clave: keyof typeof acudiente) => (valor: string) => setAcudiente((a) => ({ ...a, [clave]: valor }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    const r = RegistroFormSchema.safeParse({
      ...campos,
      tipo_documento: campos.tipo_documento || undefined,
      numero_documento: campos.numero_documento || undefined,
      aceptar_consentimiento: acepta,
      acudiente: esMenor ? acudiente : undefined,
    });
    if (!r.success) {
      setErrores(r.error);
      return;
    }
    setErrores(null);
    if (!consentimiento.data) {
      setMensaje({ tipo: 'error', texto: 'No fue posible cargar el texto de consentimiento. Recargue la pagina e intente de nuevo.' });
      return;
    }
    const payload: RegistroPayload = {
      email: r.data.email,
      password: r.data.password,
      nombres: r.data.nombres,
      apellidos: r.data.apellidos,
      fecha_nacimiento: r.data.fecha_nacimiento,
      tipo_documento: r.data.tipo_documento || undefined,
      numero_documento: r.data.numero_documento || undefined,
      aceptar_consentimiento: true,
      version_consentimiento: consentimiento.data.version,
      acudiente: esMenor && r.data.acudiente ? r.data.acudiente : undefined,
    };
    setCargando(true);
    try {
      const respuesta = await authApi.registrar(payload);
      setRegistrado(true);
      setMensaje({
        tipo: 'exito',
        texto: respuesta.requiere_verificacion
          ? 'Registro recibido. Le enviamos un correo con un enlace para confirmar su cuenta; debe confirmarlo antes de iniciar sesion.'
          : 'Registro completado. Ya puede iniciar sesion.',
      });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeErrorApi(err, 'No fue posible completar el registro. Verifique los datos e intente de nuevo.') });
    } finally {
      setCargando(false);
    }
  };

  if (registrado && mensaje) {
    return (
      <div className="mx-auto max-w-md">
        <Card titulo="Crear cuenta de beneficiario">
          <Alert tipo="exito">{mensaje.texto}</Alert>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link to="/login">Ir a iniciar sesion</Link>
            <Link to="/verificar-correo">No recibi el correo de confirmacion</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card titulo="Crear cuenta de beneficiario">
        <p className="mb-4 text-sm">
          Este registro es unicamente para estudiantes que aspiran a los beneficios del FOEST. Los funcionarios reciben una invitacion
          por correo.
        </p>
        {mensaje && (
          <Alert tipo={mensaje.tipo} className="mb-4">
            {mensaje.texto}
          </Alert>
        )}
        <form onSubmit={(e) => void enviar(e)} noValidate>
          <fieldset className="mb-4 border border-ink p-4">
            <legend className="px-2 text-sm font-semibold">Datos de identificacion</legend>
            <div className="grid gap-x-4 md:grid-cols-2">
              <FormField etiqueta="Nombres" nombre="nombres" error={errores} obligatorio>
                <Input autoComplete="given-name" value={campos.nombres} onChange={(e) => actualizar('nombres')(e.target.value)} />
              </FormField>
              <FormField etiqueta="Apellidos" nombre="apellidos" error={errores} obligatorio>
                <Input autoComplete="family-name" value={campos.apellidos} onChange={(e) => actualizar('apellidos')(e.target.value)} />
              </FormField>
              <FormField etiqueta="Fecha de nacimiento" nombre="fecha_nacimiento" error={errores} obligatorio>
                <Input type="date" autoComplete="bday" value={campos.fecha_nacimiento} onChange={(e) => actualizar('fecha_nacimiento')(e.target.value)} />
              </FormField>
              <FormField etiqueta="Tipo de documento" nombre="tipo_documento" error={errores}>
                <Select
                  opciones={OPCIONES_DOCUMENTO}
                  placeholder="Seleccione"
                  value={campos.tipo_documento}
                  onChange={(e) => actualizar('tipo_documento')(e.target.value)}
                />
              </FormField>
              <FormField etiqueta="Numero de documento" nombre="numero_documento" error={errores}>
                <Input inputMode="numeric" value={campos.numero_documento} onChange={(e) => actualizar('numero_documento')(e.target.value)} />
              </FormField>
            </div>
          </fieldset>

          {esMenor && (
            <fieldset className="mb-4 border border-ink p-4">
              <legend className="px-2 text-sm font-semibold">Datos del acudiente (titular menor de edad)</legend>
              <p className="mb-3 text-sm">Por ser menor de edad, el consentimiento de tratamiento de datos lo otorga su acudiente o representante legal.</p>
              {errores?.issues.some((i) => i.path.join('.') === 'acudiente') && (
                <p role="alert" className="mb-3 border-l-2 border-ink pl-2 text-sm font-medium">
                  Debe registrar los datos del acudiente.
                </p>
              )}
              <div className="grid gap-x-4 md:grid-cols-2">
                <FormField etiqueta="Nombre completo del acudiente" nombre="acudiente.nombre" error={errores} obligatorio>
                  <Input value={acudiente.nombre} onChange={(e) => actualizarAcudiente('nombre')(e.target.value)} />
                </FormField>
                <FormField etiqueta="Tipo de documento" nombre="acudiente.tipo_documento" error={errores} obligatorio>
                  <Select
                    opciones={OPCIONES_DOCUMENTO}
                    placeholder="Seleccione"
                    value={acudiente.tipo_documento}
                    onChange={(e) => actualizarAcudiente('tipo_documento')(e.target.value)}
                  />
                </FormField>
                <FormField etiqueta="Numero de documento" nombre="acudiente.numero_documento" error={errores} obligatorio>
                  <Input inputMode="numeric" value={acudiente.numero_documento} onChange={(e) => actualizarAcudiente('numero_documento')(e.target.value)} />
                </FormField>
                <FormField etiqueta="Correo del acudiente" nombre="acudiente.correo" error={errores} obligatorio>
                  <Input type="email" value={acudiente.correo} onChange={(e) => actualizarAcudiente('correo')(e.target.value)} />
                </FormField>
              </div>
            </fieldset>
          )}

          <fieldset className="mb-4 border border-ink p-4">
            <legend className="px-2 text-sm font-semibold">Datos de acceso</legend>
            <FormField etiqueta="Correo electronico" nombre="email" error={errores} obligatorio ayuda="A este correo llegara el enlace de confirmacion y las notificaciones.">
              <Input type="email" autoComplete="email" value={campos.email} onChange={(e) => actualizar('email')(e.target.value)} />
            </FormField>
            <div className="grid gap-x-4 md:grid-cols-2">
              <FormField etiqueta="Contrasena" nombre="password" error={errores} obligatorio ayuda={AYUDA_PASSWORD}>
                <Input type="password" autoComplete="new-password" value={campos.password} onChange={(e) => actualizar('password')(e.target.value)} />
              </FormField>
              <FormField etiqueta="Confirmar contrasena" nombre="confirmar_password" error={errores} obligatorio>
                <Input type="password" autoComplete="new-password" value={campos.confirmar_password} onChange={(e) => actualizar('confirmar_password')(e.target.value)} />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="mb-4 border border-ink p-4">
            <legend className="px-2 text-sm font-semibold">Consentimiento de tratamiento de datos personales (Ley 1581 de 2012)</legend>
            {consentimiento.isLoading && <Spinner etiqueta="Cargando texto de consentimiento" />}
            {consentimiento.isError && (
              <Alert tipo="error" className="mb-3">
                No fue posible cargar el texto de consentimiento. {mensajeDeErrorApi(consentimiento.error)}
              </Alert>
            )}
            {consentimiento.data && (
              <div className="mb-3 max-h-48 overflow-y-auto border border-ink bg-primary-10 p-3 text-sm" tabIndex={0} aria-label="Texto del consentimiento">
                <p className="whitespace-pre-line">{consentimiento.data.texto}</p>
                <p className="mt-2 text-xs">Version {consentimiento.data.version}</p>
              </div>
            )}
            <Checkbox
              etiqueta="He leido y acepto el tratamiento de mis datos personales conforme al texto anterior."
              checked={acepta}
              onChange={(e) => setAcepta(e.target.checked)}
              disabled={!consentimiento.data}
            />
            {errores?.issues.some((i) => i.path[0] === 'aceptar_consentimiento') && (
              <p role="alert" className="mt-1 border-l-2 border-ink pl-2 text-sm font-medium">
                Debe aceptar el tratamiento de datos personales para continuar.
              </p>
            )}
          </fieldset>

          <Button type="submit" bloque cargando={cargando} disabled={!consentimiento.data}>
            Registrarme
          </Button>
        </form>
        <p className="mt-4 text-sm">
          Ya tiene cuenta? <Link to="/login">Inicie sesion</Link>
        </p>
      </Card>
    </div>
  );
}
