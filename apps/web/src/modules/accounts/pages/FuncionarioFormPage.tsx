import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ActualizarFuncionarioSchema, CrearFuncionarioSchema } from '@foest/shared';
import type { ZodError } from 'zod';
import { Alert, Badge, Button, Card, FormField, Input, PageHeader, Spinner } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { useActualizarFuncionario, useEstadoFuncionario, useFuncionario, useInvitarFuncionario, useReenviarInvitacion } from '../hooks/useFuncionarios';
import { EstadoCuentaModal } from '../components/EstadoCuentaModal';
import { AsignacionesPendientesAviso } from '../components/AsignacionesPendientesAviso';

const MENSAJES: Record<string, string> = {
  CORREO_EXISTENTE: 'Ya existe una cuenta con ese correo electronico.',
  INVITACION_YA_ACEPTADA: 'El funcionario ya acepto la invitacion e inicio sesion.',
  CUENTA_DESHABILITADA: 'No es posible invitar a una cuenta deshabilitada.',
};

function textoError(e: unknown): string {
  if (e instanceof ApiRequestError) return MENSAJES[e.code] ?? e.message;
  return e instanceof Error ? e.message : 'Ocurrio un error inesperado.';
}

/** Alta por invitacion (/admin/funcionarios/nuevo) y edicion (/admin/funcionarios/:id). */
export function FuncionarioFormPage() {
  const { id } = useParams<{ id: string }>();
  const esEdicion = Boolean(id);
  const navigate = useNavigate();
  const detalle = useFuncionario(id);
  const invitar = useInvitarFuncionario();
  const actualizar = useActualizarFuncionario(id ?? '');
  const reenviar = useReenviarInvitacion();
  const cambiarEstado = useEstadoFuncionario();

  const [form, setForm] = useState({ email: '', nombres: '', apellidos: '', cargo: '', dependencia: '' });
  const [errores, setErrores] = useState<ZodError | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [modalEstado, setModalEstado] = useState(false);

  useEffect(() => {
    if (detalle.data) {
      setForm({
        email: detalle.data.email,
        nombres: detalle.data.nombres,
        apellidos: detalle.data.apellidos,
        cargo: detalle.data.cargo ?? '',
        dependencia: detalle.data.dependencia ?? '',
      });
    }
  }, [detalle.data]);

  const campo = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    if (esEdicion) {
      const r = ActualizarFuncionarioSchema.safeParse({ nombres: form.nombres, apellidos: form.apellidos, cargo: form.cargo, dependencia: form.dependencia });
      if (!r.success) return setErrores(r.error);
      setErrores(null);
      try {
        await actualizar.mutateAsync(r.data);
        setMensaje({ tipo: 'exito', texto: 'Los datos del funcionario fueron actualizados.' });
      } catch (err) {
        setMensaje({ tipo: 'error', texto: textoError(err) });
      }
      return;
    }
    const r = CrearFuncionarioSchema.safeParse(form);
    if (!r.success) return setErrores(r.error);
    setErrores(null);
    try {
      const creado = await invitar.mutateAsync(r.data);
      navigate(`/admin/funcionarios/${creado.id}`, { state: { invitado: true } });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: textoError(err) });
    }
  };

  if (esEdicion && detalle.isLoading) return <Spinner etiqueta="Cargando funcionario" />;
  if (esEdicion && detalle.error) {
    return (
      <Alert tipo="error">
        {detalle.error instanceof ApiRequestError && detalle.error.status === 404 ? 'El funcionario no existe.' : textoError(detalle.error)}
      </Alert>
    );
  }
  const f = detalle.data;

  return (
    <>
      <PageHeader
        titulo={esEdicion ? `Funcionario: ${f?.nombres ?? ''} ${f?.apellidos ?? ''}` : 'Nuevo funcionario'}
        descripcion={esEdicion ? 'Datos institucionales y estado de la cuenta.' : 'Se enviara una invitacion al correo institucional para que el funcionario defina su contrasena.'}
        migas={[{ etiqueta: 'Funcionarios', ruta: '/admin/funcionarios' }, { etiqueta: esEdicion ? 'Detalle' : 'Nuevo' }]}
        acciones={
          esEdicion && f ? (
            <>
              {f.invitacion_pendiente && f.activo && (
                <Button
                  variante="secundario"
                  cargando={reenviar.isPending}
                  onClick={async () => {
                    setMensaje(null);
                    try {
                      await reenviar.mutateAsync(f.id);
                      setMensaje({ tipo: 'exito', texto: 'La invitacion fue reenviada al correo del funcionario.' });
                    } catch (err) {
                      setMensaje({ tipo: 'error', texto: textoError(err) });
                    }
                  }}
                >
                  Reenviar invitacion
                </Button>
              )}
              <Button variante="secundario" onClick={() => setModalEstado(true)}>
                {f.activo ? 'Deshabilitar cuenta' : 'Reactivar cuenta'}
              </Button>
            </>
          ) : undefined
        }
      />
      {mensaje && (
        <Alert tipo={mensaje.tipo} className="mb-4">
          {mensaje.texto}
        </Alert>
      )}
      {f && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge tono={f.activo ? 'relleno' : 'neutro'}>{f.activo ? 'Cuenta activa' : 'Cuenta deshabilitada'}</Badge>
          <Badge tono="destacado">{f.invitacion_pendiente ? 'Invitacion pendiente de aceptar' : `Ultimo acceso: ${f.ultimo_login ? new Date(f.ultimo_login).toLocaleString('es-CO') : '-'}`}</Badge>
        </div>
      )}
      {f && f.pendientes.pendientes > 0 && (
        <div className="mb-4">
          <AsignacionesPendientesAviso pendientes={f.pendientes} />
        </div>
      )}
      <Card titulo={esEdicion ? 'Datos institucionales' : 'Datos de la invitacion'}>
        <form onSubmit={(e) => void enviar(e)} noValidate className="grid gap-x-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField etiqueta="Correo institucional" nombre="email" error={errores} obligatorio ayuda={esEdicion ? 'El correo no se puede modificar.' : undefined}>
              <Input type="email" value={form.email} onChange={campo('email')} disabled={esEdicion} autoComplete="off" />
            </FormField>
          </div>
          <FormField etiqueta="Nombres" nombre="nombres" error={errores} obligatorio>
            <Input value={form.nombres} onChange={campo('nombres')} />
          </FormField>
          <FormField etiqueta="Apellidos" nombre="apellidos" error={errores} obligatorio>
            <Input value={form.apellidos} onChange={campo('apellidos')} />
          </FormField>
          <FormField etiqueta="Cargo" nombre="cargo" error={errores} obligatorio>
            <Input value={form.cargo} onChange={campo('cargo')} />
          </FormField>
          <FormField etiqueta="Dependencia" nombre="dependencia" error={errores} obligatorio>
            <Input value={form.dependencia} onChange={campo('dependencia')} />
          </FormField>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" cargando={invitar.isPending || actualizar.isPending}>
              {esEdicion ? 'Guardar cambios' : 'Enviar invitacion'}
            </Button>
            <Button variante="secundario" onClick={() => navigate('/admin/funcionarios')}>
              Volver al listado
            </Button>
          </div>
        </form>
      </Card>
      {f && (
        <EstadoCuentaModal
          abierto={modalEstado}
          etiquetaCuenta={`${f.nombres} ${f.apellidos}`}
          activar={!f.activo}
          permiteForzar
          cargando={cambiarEstado.isPending}
          error={cambiarEstado.error}
          onCerrar={() => {
            setModalEstado(false);
            cambiarEstado.reset();
          }}
          onConfirmar={async (dto) => {
            try {
              await cambiarEstado.mutateAsync({ id: f.id, dto });
              setModalEstado(false);
              cambiarEstado.reset();
              setMensaje({ tipo: 'exito', texto: dto.activo ? 'La cuenta fue reactivada.' : 'La cuenta fue deshabilitada y sus sesiones revocadas.' });
            } catch {
              // se muestra en el modal
            }
          }}
        />
      )}
    </>
  );
}
