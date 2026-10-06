import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ESTADO_CIVIL_ETIQUETA, GENERO_ETIQUETA, PARENTESCO_ETIQUETA } from '@foest/shared';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { useBeneficiario, useCorregirDocumento, useEstadoBeneficiario } from '../hooks/useBeneficiarios';
import { EstadoCuentaModal } from '../components/EstadoCuentaModal';
import { CorregirDocumentoModal } from '../components/CorregirDocumentoModal';

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="border-b border-ink/30 py-2">
      <dt className="text-sm font-semibold">{etiqueta}</dt>
      <dd className="text-base">{valor ?? '-'}</dd>
    </div>
  );
}

/** Lectura del perfil por el Administrador: estado de la cuenta y correccion de documento con motivo. */
export function BeneficiarioDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useBeneficiario(id);
  const cambiarEstado = useEstadoBeneficiario();
  const corregir = useCorregirDocumento();
  const [modalEstado, setModalEstado] = useState(false);
  const [modalDoc, setModalDoc] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (isLoading) return <Spinner etiqueta="Cargando perfil" />;
  if (error || !data) {
    return <Alert tipo="error">{error instanceof ApiRequestError && error.status === 404 ? 'El beneficiario no existe.' : ((error as Error | null)?.message ?? 'Sin datos')}</Alert>;
  }
  const b = data.beneficiario;
  const a = data.acudiente;
  const nombre = [b?.nombres, b?.apellidos].filter(Boolean).join(' ') || data.email;

  return (
    <>
      <PageHeader
        titulo={`Beneficiario: ${nombre}`}
        descripcion="Perfil del estudiante (seccion 1 del formato GE-F041). Esta lectura queda registrada en la auditoria."
        migas={[{ etiqueta: 'Beneficiarios', ruta: '/admin/beneficiarios' }, { etiqueta: 'Detalle' }]}
        acciones={
          <>
            {b && !b.anonimizado && (
              <Button variante="secundario" onClick={() => setModalDoc(true)}>
                Corregir documento
              </Button>
            )}
            {b && !b.anonimizado && (
              <Button variante="secundario" onClick={() => setModalEstado(true)}>
                {data.activo ? 'Deshabilitar cuenta' : 'Reactivar cuenta'}
              </Button>
            )}
          </>
        }
      />
      {mensaje && (
        <Alert tipo="exito" className="mb-4">
          {mensaje}
        </Alert>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tono={data.activo ? 'relleno' : 'neutro'}>{data.activo ? 'Cuenta activa' : 'Cuenta deshabilitada'}</Badge>
        <Badge tono={data.perfil_completo ? 'destacado' : 'neutro'}>{data.perfil_completo ? 'Perfil completo' : 'Perfil incompleto'}</Badge>
        {data.es_menor && <Badge tono="destacado">Menor de edad</Badge>}
        {b?.anonimizado && <Badge tono="neutro">Anonimizado</Badge>}
        <Badge tono="neutro">Consentimiento v{data.consentimiento_vigente.version}: {data.consentimiento_vigente.aceptado ? 'aceptado' : 'pendiente'}</Badge>
      </div>
      {!b && <Alert tipo="info">El beneficiario aun no ha diligenciado su perfil.</Alert>}
      {b && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card titulo="Identificacion y contacto">
            <dl>
              <Dato etiqueta="Correo de la cuenta" valor={data.email} />
              <Dato etiqueta="Documento" valor={<span className="font-mono">{b.tipo_documento ?? ''} {b.numero_documento ?? '-'}</span>} />
              <Dato etiqueta="Lugar de expedicion" valor={b.expedido_en} />
              <Dato etiqueta="Fecha de nacimiento" valor={b.fecha_nacimiento} />
              <Dato etiqueta="Genero" valor={b.genero ? (GENERO_ETIQUETA as Record<string, string>)[b.genero] ?? b.genero : null} />
              <Dato etiqueta="Estado civil" valor={b.estado_civil ? (ESTADO_CIVIL_ETIQUETA as Record<string, string>)[b.estado_civil] ?? b.estado_civil : null} />
              <Dato etiqueta="Celular principal" valor={b.celular_1} />
              <Dato etiqueta="Celular alterno" valor={b.celular_2} />
              <Dato etiqueta="Correo alternativo" valor={b.correo_notificacion_2} />
            </dl>
          </Card>
          <Card titulo="Residencia y condicion socioeconomica">
            <dl>
              <Dato etiqueta="Direccion" valor={b.direccion} />
              <Dato etiqueta="Sector" valor={b.sector} />
              <Dato etiqueta="Estrato" valor={b.estrato} />
              <Dato etiqueta="Categoria SISBEN" valor={b.sisben_categoria} />
              <Dato etiqueta="Puntaje SISBEN" valor={b.sisben_puntaje} />
              <Dato etiqueta="Ultima actualizacion" valor={new Date(b.actualizado_en).toLocaleString('es-CO')} />
            </dl>
          </Card>
          {data.es_menor && (
            <Card titulo="Acudiente" className="md:col-span-2">
              {a ? (
                <dl className="grid md:grid-cols-2 md:gap-x-6">
                  <Dato etiqueta="Nombre" valor={`${a.nombres ?? ''} ${a.apellidos ?? ''}`} />
                  <Dato etiqueta="Documento" valor={<span className="font-mono">{a.tipo_documento ?? ''} {a.numero_documento ?? '-'}</span>} />
                  <Dato etiqueta="Parentesco" valor={a.parentesco ? (PARENTESCO_ETIQUETA as Record<string, string>)[a.parentesco] ?? a.parentesco : null} />
                  <Dato etiqueta="Celular" valor={a.celular} />
                  <Dato etiqueta="Correo" valor={a.correo} />
                </dl>
              ) : (
                <Alert tipo="advertencia">El beneficiario es menor de edad y aun no registra acudiente.</Alert>
              )}
            </Card>
          )}
        </div>
      )}
      {b && (
        <>
          <EstadoCuentaModal
            abierto={modalEstado}
            etiquetaCuenta={nombre}
            activar={!data.activo}
            cargando={cambiarEstado.isPending}
            error={cambiarEstado.error}
            onCerrar={() => {
              setModalEstado(false);
              cambiarEstado.reset();
            }}
            onConfirmar={async (dto) => {
              try {
                await cambiarEstado.mutateAsync({ id: b.id, dto });
                setModalEstado(false);
                cambiarEstado.reset();
                setMensaje(dto.activo ? 'La cuenta fue reactivada.' : 'La cuenta fue deshabilitada y sus sesiones revocadas.');
              } catch {
                // en el modal
              }
            }}
          />
          <CorregirDocumentoModal
            abierto={modalDoc}
            tipoActual={b.tipo_documento}
            numeroActual={b.numero_documento}
            cargando={corregir.isPending}
            error={corregir.error}
            onCerrar={() => {
              setModalDoc(false);
              corregir.reset();
            }}
            onConfirmar={async (dto) => {
              try {
                await corregir.mutateAsync({ id: b.id, dto });
                setModalDoc(false);
                corregir.reset();
                setMensaje('El documento fue corregido y el cambio quedo auditado.');
              } catch {
                // en el modal
              }
            }}
          />
        </>
      )}
    </>
  );
}
