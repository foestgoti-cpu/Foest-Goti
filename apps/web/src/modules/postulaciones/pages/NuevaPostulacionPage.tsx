import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { TIPOS_SOLICITUD, type TipoSolicitud } from '@foest/shared';
import { Alert, Button, Card, EmptyState, FormField, Select, Spinner } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { postulacionesApi } from '../api';
import { useConvocatoriasAbiertas, useInvalidarPostulacion } from '../hooks/usePostulaciones';
import { cierrePresentado, TEXTO_TIPO_SOLICITUD } from '../formato';

const AYUDA_TIPO: Record<TipoSolicitud, string> = {
  PRIMERA_VEZ: 'Si nunca ha sido beneficiario del FOEST.',
  RENOVACION: 'Si fue beneficiario en el periodo inmediatamente anterior y desea continuar.',
  REINTEGRO: 'Si fue beneficiario en un periodo anterior no consecutivo.',
};

export function NuevaPostulacionPage() {
  const navigate = useNavigate();
  const invalidar = useInvalidarPostulacion();
  const { data: convocatorias, isLoading, error } = useConvocatoriasAbiertas();
  const [convocatoriaId, setConvocatoriaId] = useState('');
  const [tipo, setTipo] = useState<TipoSolicitud | ''>('');
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'advertencia'; texto: string; accion?: string } | null>(null);

  const crear = useMutation({
    mutationFn: () => postulacionesApi.crear({ convocatoria_id: convocatoriaId, tipo_solicitud: tipo as TipoSolicitud }),
    onSuccess: (p) => {
      invalidar(p.id);
      navigate(`/beneficiario/postulaciones/${p.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiRequestError) {
        if (e.code === 'PERFIL_INCOMPLETO') return setMensaje({ tipo: 'advertencia', texto: 'Debe completar su perfil antes de postularse.', accion: '/beneficiario/perfil' });
        if (e.code === 'POSTULACION_DUPLICADA') return setMensaje({ tipo: 'advertencia', texto: 'Ya tiene una postulacion para esta convocatoria. Consultela en Mis postulaciones.', accion: '/beneficiario/postulaciones' });
        if (e.code === 'CONVOCATORIA_NO_ABIERTA') return setMensaje({ tipo: 'advertencia', texto: 'La convocatoria ya no esta abierta.' });
        if (e.code === 'TRAMITE_NO_ELEGIBLE') return setMensaje({ tipo: 'advertencia', texto: e.message });
        return setMensaje({ tipo: 'error', texto: e.message });
      }
      setMensaje({ tipo: 'error', texto: 'No fue posible crear la postulacion.' });
    },
  });

  const seleccionada = convocatorias?.find((c) => c.id === convocatoriaId);

  return (
    <>
      <PageHeaderNueva />
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      {isLoading && <Spinner />}
      {convocatorias && convocatorias.length === 0 && (
        <EmptyState
          titulo="No hay convocatorias abiertas"
          descripcion="Cuando el FOEST habilite una convocatoria podra iniciar su postulacion desde esta pagina."
          accion={<Link to="/beneficiario/postulaciones">Volver a Mis postulaciones</Link>}
        />
      )}
      {convocatorias && convocatorias.length > 0 && (
        <Card titulo="Iniciar una postulacion">
          {mensaje && (
            <Alert tipo={mensaje.tipo} className="mb-4">
              {mensaje.texto}{' '}
              {mensaje.accion && (
                <Link to={mensaje.accion} className="ml-1">
                  Ir
                </Link>
              )}
            </Alert>
          )}
          <FormField etiqueta="Convocatoria" nombre="convocatoria" obligatorio>
            <Select
              placeholder="Seleccione una convocatoria"
              opciones={convocatorias.map((c) => ({ valor: c.id, etiqueta: `${c.nombre} (cierra el ${cierrePresentado(c.fecha_cierre_exclusiva)})` }))}
              value={convocatoriaId}
              onChange={(e) => setConvocatoriaId(e.target.value)}
            />
          </FormField>
          {seleccionada && (
            <p className="mb-4 text-sm">Beneficios ofertados: {(seleccionada.beneficios_ofertados ?? []).join(', ') || 'por definir'}.</p>
          )}
          <FormField etiqueta="Tipo de tramite" nombre="tipo" obligatorio ayuda={tipo ? AYUDA_TIPO[tipo] : 'Seleccione el tramite que corresponde a su situacion.'}>
            <Select
              placeholder="Seleccione el tipo de tramite"
              opciones={TIPOS_SOLICITUD.map((t) => ({ valor: t, etiqueta: TEXTO_TIPO_SOLICITUD[t] ?? t }))}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoSolicitud | '')}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => crear.mutate()} disabled={!convocatoriaId || !tipo} cargando={crear.isPending}>
              Crear borrador
            </Button>
            <Button variante="secundario" onClick={() => navigate('/beneficiario/postulaciones')}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

function PageHeaderNueva() {
  return (
    <div className="mb-6 border-b border-ink pb-4">
      <nav aria-label="Ruta de navegacion" className="mb-2 text-sm">
        <Link to="/beneficiario/postulaciones">Mis postulaciones</Link> <span aria-hidden="true">/</span> <span aria-current="page">Nueva postulacion</span>
      </nav>
      <h1>Nueva postulacion</h1>
      <p className="mt-1 max-w-3xl text-base text-ink/80">Elija la convocatoria abierta y el tipo de tramite. Se creara un borrador que podra completar por partes.</p>
    </div>
  );
}
