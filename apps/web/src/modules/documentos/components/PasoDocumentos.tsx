import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Modal, Spinner } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { useDocumentosPostulacion, useEliminarDocumento, useFormatosParaDocumentos, useInvalidarDocumentos } from '../hooks/useDocumentos';
import type { DocumentoDto, TipoDocumentoDto } from '../types';
import { DocumentChecklist } from './DocumentChecklist';
import { DocumentViewerModal } from './DocumentViewerModal';
import { FileUploader } from './FileUploader';

export interface PasoDocumentosProps {
  postulacionId: string;
  /** Fuerza el modo de consulta (sin cargar, reemplazar ni eliminar). */
  soloLectura?: boolean;
}

const MB = 1024 * 1024;

/**
 * Paso "Documentos de soporte" del asistente de postulacion (tambien lo usa la pagina
 * /beneficiario/postulaciones/:id/documentos). Muestra los soportes exigibles con su estado y
 * permite cargar, reemplazar, ver y eliminar mientras la postulacion lo permita.
 */
export function PasoDocumentos({ postulacionId, soloLectura = false }: PasoDocumentosProps) {
  const { data, isLoading, error } = useDocumentosPostulacion(postulacionId);
  const invalidar = useInvalidarDocumentos(postulacionId);
  const eliminar = useEliminarDocumento(postulacionId);

  const [cargando, setCargando] = useState<{ tipo: TipoDocumentoDto; reemplazo: boolean } | null>(null);
  const [viendo, setViendo] = useState<DocumentoDto | null>(null);
  const [porEliminar, setPorEliminar] = useState<DocumentoDto | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const requiereFormato = cargando?.tipo.formato_oficial === 'GE-F041' || cargando?.tipo.formato_oficial === 'GE-F043';
  const formatos = useFormatosParaDocumentos(postulacionId, Boolean(requiereFormato));

  if (isLoading) return <Spinner etiqueta="Cargando soportes" />;
  if (error || !data) {
    return <Alert tipo="error">{error instanceof ApiRequestError ? error.message : 'No fue posible cargar los soportes de la postulacion.'}</Alert>;
  }

  const editable = data.editable && !soloLectura;
  const obligatoriosFaltan = data.exigibles.filter((e) => e.obligatorio && !data.documentos.some((d) => d.tipo_codigo === e.codigo && d.estado_carga === 'DISPONIBLE')).length;

  // Formato oficial vigente que respalda FORM_INS / PAG_CART (si el modulo de formatos responde).
  let formatoId: string | undefined;
  let formatoFaltante = false;
  if (cargando && requiereFormato && formatos.data) {
    const resumen = formatos.data.formatos.find((f) => f.tipo === cargando.tipo.formato_oficial);
    formatoId = resumen?.situacion === 'VIGENTE' ? (resumen.formato?.id ?? undefined) : undefined;
    formatoFaltante = !formatoId;
  }

  const abrir = (tipo: TipoDocumentoDto, reemplazo: boolean) => {
    setErrorAccion(null);
    setAviso(null);
    setCargando({ tipo, reemplazo });
  };

  const confirmarEliminar = async () => {
    if (!porEliminar) return;
    try {
      await eliminar.mutateAsync(porEliminar.id);
      setAviso('El soporte fue eliminado.');
    } catch (e) {
      setErrorAccion(e instanceof ApiRequestError ? e.message : 'No fue posible eliminar el soporte.');
    } finally {
      setPorEliminar(null);
    }
  };

  const usadoMb = data.limites.usado_bytes / MB;

  return (
    <div>
      <p className="mb-3 text-sm">
        Cargue los soportes exigidos para los beneficios y el tramite de su postulacion. Se admiten archivos PDF, JPEG o PNG de hasta {data.limites.max_archivo_mb} MB. Un soporte solo cuenta
        para el envio cuando ya fue verificado.
      </p>
      <p className="mb-3 text-sm">
        Espacio utilizado: {usadoMb.toFixed(2)} MB de {data.limites.cuota_postulacion_mb} MB.{' '}
        {obligatoriosFaltan > 0 ? `Soportes obligatorios pendientes: ${obligatoriosFaltan}.` : 'Todos los soportes obligatorios estan cargados.'}
      </p>

      {!editable && (
        <Alert tipo="info" className="mb-3">
          {soloLectura ? 'Los soportes se muestran en modo de consulta.' : (data.motivo_bloqueo ?? 'Los soportes no pueden modificarse en este momento.')}
        </Alert>
      )}
      {data.fecha_limite && editable && (
        <Alert tipo="advertencia" className="mb-3">
          Puede modificar los soportes hasta el {new Date(data.fecha_limite).toLocaleString('es-CO')}.
        </Alert>
      )}
      {errorAccion && (
        <Alert tipo="error" className="mb-3">
          {errorAccion}
        </Alert>
      )}
      {aviso && (
        <Alert tipo="exito" className="mb-3">
          {aviso}
        </Alert>
      )}

      <DocumentChecklist
        datos={data}
        tipoActivo={cargando?.tipo.codigo ?? null}
        onCargar={editable ? (t) => abrir(t, false) : undefined}
        onReemplazar={editable ? (_d, t) => abrir(t, true) : undefined}
        onEliminar={editable ? (d) => setPorEliminar(d) : undefined}
        onVer={(d) => setViendo(d)}
        renderDetalle={(tipo) => {
          if (!editable || !cargando || cargando.tipo.codigo !== tipo.codigo) return null;
          if (requiereFormato && formatos.isLoading) return <Spinner etiqueta="Consultando el formato oficial" />;
          if (requiereFormato && formatoFaltante) {
            return (
              <Alert tipo="advertencia" titulo={`Formato ${tipo.formato_oficial} requerido`}>
                <p>Antes de cargar este soporte debe generar el formato oficial vigente, firmarlo y escanearlo.</p>
                <p className="mt-2">
                  <Link to={`/beneficiario/postulaciones/${postulacionId}/formatos`} className="text-primary underline">
                    Ir a los formatos oficiales
                  </Link>
                </p>
              </Alert>
            );
          }
          return (
            <FileUploader
              postulacionId={postulacionId}
              tipo={tipo.codigo}
              nombreTipo={tipo.nombre}
              maxMb={data.limites.max_archivo_mb}
              formatoGeneradoId={formatoId}
              esReemplazo={cargando.reemplazo}
              exigeMotivo={data.fecha_limite !== null}
              onCancelar={() => setCargando(null)}
              onTerminado={() => {
                setCargando(null);
                setAviso('El soporte fue cargado correctamente.');
                void invalidar();
              }}
            />
          );
        }}
      />

      <DocumentViewerModal abierto={viendo !== null} documentoId={viendo?.id ?? null} titulo={viendo?.tipo_nombre ?? 'Soporte'} onCerrar={() => setViendo(null)} />

      <Modal
        abierto={porEliminar !== null}
        titulo="Eliminar soporte"
        onCerrar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        textoConfirmar="Eliminar soporte"
        cargando={eliminar.isPending}
        confirmacion={{ palabra: 'ELIMINAR', comprension: 'Entiendo que el soporte dejara de formar parte de mi postulacion y debere cargarlo de nuevo.' }}
      >
        <p>Se eliminara el soporte &quot;{porEliminar?.tipo_nombre}&quot;. Esta accion queda registrada.</p>
      </Modal>
    </div>
  );
}
