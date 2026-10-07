import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { postulacionesApi } from '../api';
import { useGuardarPostulacion, useInvalidarPostulacion, usePostulacion, useValidacion } from '../hooks/usePostulaciones';
import { FormularioMultiPaso } from '../components/FormularioMultiPaso';
import { DescargarFormulariosCard } from '../../formatos_oficiales/components/DescargarFormulariosCard';
import { ConfirmacionEnvioModal } from '../components/ConfirmacionEnvioModal';
import { cierrePresentado, fechaLarga, TEXTO_TIPO_SOLICITUD } from '../formato';
import type { GuardarPayload } from '../types';

function nuevaLlave(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PostulacionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invalidar = useInvalidarPostulacion();
  const { data: postulacion, isLoading, error, refetch } = usePostulacion(id);
  const { data: validacion } = useValidacion(id);
  const guardar = useGuardarPostulacion(id ?? '');
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [modalEnvio, setModalEnvio] = useState(false);
  const [llave, setLlave] = useState<string>(() => nuevaLlave());
  const [modalDesistir, setModalDesistir] = useState(false);
  const [modalEliminar, setModalEliminar] = useState(false);
  const [motivoDesistir, setMotivoDesistir] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const onGuardar = useCallback(
    async (payload: Omit<GuardarPayload, 'version'>) => {
      if (!postulacion) return;
      setErrorGuardado(null);
      try {
        await guardar.mutateAsync({ version: postulacion.version, ...payload });
      } catch (e) {
        if (e instanceof ApiRequestError && e.code === 'VERSION_CONFLICTO') {
          setErrorGuardado('La postulacion fue modificada en otra sesion. Se recargaron los datos; verifique sus cambios.');
          await refetch();
        } else if (e instanceof ApiRequestError) {
          setErrorGuardado(`${e.message}${e.code === 'CIFRADO_NO_CONFIGURADO' ? ' (contacte al administrador).' : ''}`);
        } else {
          setErrorGuardado('No fue posible guardar los cambios.');
        }
        throw e;
      }
    },
    [guardar, postulacion, refetch],
  );

  const enviar = useMutation({
    mutationFn: () => {
      if (!postulacion) throw new Error('Sin postulacion');
      const cuerpo = {
        confirmar: true as const,
        version: postulacion.version,
        declaraciones_aceptadas: (validacion?.declaraciones.vigentes ?? []).map((d) => d.codigo).filter((c) => !(validacion?.declaraciones.pendientes ?? []).includes(c)),
      };
      return postulacion.estado === 'EN_CORRECCION' ? postulacionesApi.subsanar(postulacion.id, cuerpo, llave) : postulacionesApi.enviar(postulacion.id, cuerpo, llave);
    },
    onSuccess: (r) => {
      setModalEnvio(false);
      setLlave(nuevaLlave());
      invalidar(r.postulacion_id);
      setAviso(`Su ${postulacion?.estado === 'EN_CORRECCION' ? 'subsanacion' : 'postulacion'} fue recibida (ciclo ${r.ciclo}). Sera revisada por el Comite FOEST.`);
    },
    onError: (e) => {
      setModalEnvio(false);
      if (e instanceof ApiRequestError) {
        const detalles = (e.details as { campos_faltantes?: Array<{ seccion_titulo: string; campo: string }> } | undefined)?.campos_faltantes;
        setErrorGuardado(`${e.message}${detalles?.length ? `: ${detalles.slice(0, 5).map((d) => `${d.seccion_titulo} - ${d.campo}`).join('; ')}` : ''}`);
        invalidar(id ?? '');
      } else setErrorGuardado('No fue posible enviar la postulacion.');
    },
  });

  const desistir = useMutation({
    mutationFn: () => postulacionesApi.desistir(postulacion!.id, { version: postulacion!.version, motivo: motivoDesistir.trim() || undefined }),
    onSuccess: () => {
      setModalDesistir(false);
      invalidar(id ?? '');
      setAviso('Su desistimiento fue registrado. Esta accion no puede deshacerse.');
    },
    onError: (e) => {
      setModalDesistir(false);
      setErrorGuardado(e instanceof ApiRequestError ? e.message : 'No fue posible registrar el desistimiento.');
    },
  });

  const eliminar = useMutation({
    mutationFn: () => postulacionesApi.eliminar(postulacion!.id),
    onSuccess: () => {
      invalidar(id ?? '');
      navigate('/beneficiario/postulaciones');
    },
    onError: (e) => {
      setModalEliminar(false);
      setErrorGuardado(e instanceof ApiRequestError ? e.message : 'No fue posible eliminar el borrador.');
    },
  });

  const puedeDesistir = useMemo(() => postulacion && ['PENDIENTE', 'EN_EVALUACION', 'EN_CORRECCION'].includes(postulacion.estado), [postulacion]);

  if (isLoading) return <Spinner />;
  if (error || !postulacion) {
    return (
      <Alert tipo="error">
        {error instanceof ApiRequestError && error.status === 404 ? 'La postulacion no existe o no le pertenece.' : (error as Error | null)?.message ?? 'Error'}{' '}
        <Link to="/beneficiario/postulaciones">Volver</Link>
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        titulo={`Postulacion: ${postulacion.convocatoria?.nombre ?? 'Convocatoria'}`}
        migas={[{ etiqueta: 'Mis postulaciones', ruta: '/beneficiario/postulaciones' }, { etiqueta: 'Detalle' }]}
        descripcion={
          <span>
            Tramite: {TEXTO_TIPO_SOLICITUD[postulacion.tipo_solicitud] ?? postulacion.tipo_solicitud}. Estado: <Badge tono="destacado">{postulacion.estado_texto}</Badge>
            {postulacion.estado === 'BORRADOR' && <span className="block">La convocatoria cierra el {cierrePresentado(postulacion.convocatoria?.fecha_cierre_exclusiva)}.</span>}
            {postulacion.estado === 'EN_CORRECCION' && <span className="block">Plazo para corregir: {fechaLarga(postulacion.fecha_limite_subsanacion)}.</span>}
            {postulacion.ciclo > 0 && <span className="block">Ciclo de revision: {postulacion.ciclo}.</span>}
          </span>
        }
        acciones={
          <>
            <Link to={`/beneficiario/postulaciones/${postulacion.id}/historial`} className="min-h-[44px] inline-flex items-center px-2">
              Ver historial
            </Link>
            {postulacion.estado === 'BORRADOR' && (
              <Button variante="secundario" onClick={() => setModalEliminar(true)}>
                Eliminar borrador
              </Button>
            )}
            {puedeDesistir && (
              <Button variante="secundario" onClick={() => setModalDesistir(true)}>
                Desistir
              </Button>
            )}
          </>
        }
      />

      {aviso && (
        <Alert tipo="exito" className="mb-4">
          {aviso}
        </Alert>
      )}

      {['APROBADA', 'RECHAZADA', 'DESISTIDA'].includes(postulacion.estado) && (
        <Card titulo="Resultado" className="mb-4">
          <p>{postulacion.estado_texto}</p>
          {postulacion.correccion_vigente?.observaciones && <p className="mt-2 border-l-2 border-ink pl-2 text-sm">{postulacion.correccion_vigente.observaciones} (Equipo FOEST)</p>}
        </Card>
      )}

      {['BORRADOR', 'EN_CORRECCION'].includes(postulacion.estado) && (
        <div className="mb-4">
          <DescargarFormulariosCard postulacionId={postulacion.id} enlaceDetalle />
        </div>
      )}

      <FormularioMultiPaso
        key={postulacion.id}
        postulacion={postulacion}
        validacion={validacion}
        guardando={guardar.isPending}
        errorGuardado={errorGuardado}
        onGuardar={onGuardar}
        onEnviar={() => setModalEnvio(true)}
      />

      <ConfirmacionEnvioModal
        abierto={modalEnvio}
        postulacion={postulacion}
        modo={postulacion.estado === 'EN_CORRECCION' ? 'SUBSANACION' : 'ENVIO'}
        cargando={enviar.isPending}
        onCerrar={() => setModalEnvio(false)}
        onConfirmar={() => enviar.mutate()}
      />

      <Modal
        abierto={modalDesistir}
        titulo="Desistir de la postulacion"
        onCerrar={() => setModalDesistir(false)}
        onConfirmar={() => desistir.mutate()}
        textoConfirmar="Desistir"
        cargando={desistir.isPending}
        confirmacion={{ palabra: 'DESISTIR', comprension: 'Entiendo que el desistimiento es definitivo y no podre postularme de nuevo en esta convocatoria.' }}
      >
        <p className="mb-3 text-sm">Puede indicar el motivo (opcional).</p>
        <Textarea value={motivoDesistir} onChange={(e) => setMotivoDesistir(e.target.value)} maxLength={2000} />
      </Modal>

      <Modal
        abierto={modalEliminar}
        titulo="Eliminar el borrador"
        onCerrar={() => setModalEliminar(false)}
        onConfirmar={() => eliminar.mutate()}
        textoConfirmar="Eliminar"
        cargando={eliminar.isPending}
        confirmacion={{ palabra: 'ELIMINAR', comprension: 'Entiendo que el borrador y su informacion se eliminaran de forma permanente.' }}
      >
        <p className="text-sm">El borrador no ha sido enviado; eliminarlo no tiene efectos legales. Podra crear uno nuevo mientras la convocatoria siga abierta.</p>
      </Modal>
    </>
  );
}
