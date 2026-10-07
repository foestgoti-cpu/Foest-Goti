import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, EmptyState, PageHeader, Spinner } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { DescargarResumenButton } from '../../export_reports';
import { usePermissions } from '../../roles_permissions';
import { DictamenFinalModal } from '../components/DictamenFinalModal';
import { FormularioExpediente } from '../components/FormularioExpediente';
import { HistorialRevisionesPanel } from '../components/HistorialRevisionesPanel';
import { mapaDesdeChequeo, TablaChequeoDocumental, type MapaChequeo } from '../components/TablaChequeoDocumental';
import { VisorDocumentoModal } from '../components/VisorDocumentoModal';
import { useExpediente, useGuardarChequeo } from '../hooks/useEvaluacion';
import { HistorialAsignacion } from '../../asignaciones/components/HistorialAsignacion';
import { Card } from '../../../components/ui';
import type { ChequeoInput, DocumentoExpedienteDto } from '../types';

/** Pantalla dividida de evaluacion. `soloLectura` fuerza el modo del administrador. */
export function EvaluacionExpedientePage({ soloLecturaForzada = false }: { soloLecturaForzada?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const { can } = usePermissions();
  const { data: e, isLoading, error, refetch } = useExpediente(id);
  const guardar = useGuardarChequeo(id ?? '');

  const [valores, setValores] = useState<MapaChequeo>({});
  const [sucio, setSucio] = useState(false);
  const [verDoc, setVerDoc] = useState<DocumentoExpedienteDto | null>(null);
  const [dictamenAbierto, setDictamenAbierto] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'advertencia' | 'error'; texto: string } | null>(null);

  // Sincroniza el borrador con el chequeo vigente cada vez que llega un expediente nuevo.
  useEffect(() => {
    if (e) {
      setValores(mapaDesdeChequeo(e.chequeo.items));
      setSucio(false);
    }
  }, [e]);

  const escritura = e?.modo === 'ESCRITURA';
  const soloLectura = soloLecturaForzada || !can('evaluacion:revisar') || !escritura;
  const puedeDictaminar = !soloLecturaForzada && can('evaluacion:dictaminar') && escritura;

  const itemsParaGuardar = useMemo<ChequeoInput['items']>(() => {
    if (!e) return [];
    const items: ChequeoInput['items'] = [];
    for (const d of e.documentos) {
      const v = valores[d.tipo_codigo];
      if (!v || !v.resultado) continue;
      items.push({ tipo_codigo: d.tipo_codigo, resultado: v.resultado, observacion: v.observacion.trim() || null });
    }
    return items;
  }, [e, valores]);

  const manejarConflicto = async (mensaje: string) => {
    setDictamenAbierto(false);
    setAviso({ tipo: 'advertencia', texto: mensaje });
    await refetch();
  };

  const onGuardar = async () => {
    if (!e) return;
    setAviso(null);
    if (itemsParaGuardar.length === 0) {
      setAviso({ tipo: 'advertencia', texto: 'Califique al menos un tipo de documento antes de guardar.' });
      return;
    }
    try {
      await guardar.mutateAsync({ version: e.postulacion.version, items: itemsParaGuardar });
      setAviso({ tipo: 'exito', texto: 'Chequeo guardado.' });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        await manejarConflicto('La postulacion cambio mientras usted la revisaba. Se recargo el expediente; vuelva a registrar su chequeo.');
      } else if (err instanceof ApiRequestError && err.status === 503) {
        setAviso({ tipo: 'error', texto: 'El chequeo documental no esta disponible por el momento. Intente de nuevo mas tarde.' });
      } else {
        setAviso({ tipo: 'error', texto: (err as Error).message });
      }
    }
  };

  if (isLoading) return <Spinner />;
  if (error || !e) {
    const noDisponible = error instanceof ApiRequestError && error.status === 404;
    return (
      <EmptyState
        titulo={noDisponible ? 'Expediente no disponible' : 'No fue posible cargar el expediente'}
        descripcion={noDisponible ? 'La postulacion no existe o usted no tiene una asignacion sobre ella.' : (error as Error | null)?.message}
      />
    );
  }

  return (
    <>
      <PageHeader
        titulo="Evaluacion de postulacion"
        acciones={<DescargarResumenButton postulacionId={e.postulacion.id} />}
        migas={
          soloLecturaForzada
            ? [{ etiqueta: 'Postulaciones', ruta: '/admin/postulaciones' }, { etiqueta: 'Evaluacion (lectura)' }]
            : [{ etiqueta: 'Bandeja', ruta: '/funcionario/bandeja' }, { etiqueta: 'Evaluacion' }]
        }
        descripcion={
          soloLectura
            ? 'Consulta en modo de solo lectura. La apertura del expediente queda registrada en auditoria.'
            : 'Califique cada tipo de documento y emita el dictamen. La apertura del expediente queda registrada en auditoria.'
        }
      />

      {aviso && (
        <Alert tipo={aviso.tipo} className="mb-4">
          {aviso.texto}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <FormularioExpediente expediente={e} />
          <HistorialRevisionesPanel postulacionId={e.postulacion.id} />
          {soloLecturaForzada && (
            <Card titulo="Historial de asignaciones">
              <HistorialAsignacion postulacionId={e.postulacion.id} />
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {!e.documentos_disponibles && (
            <Alert tipo="advertencia">El modulo de documentos aun no esta disponible; no hay soportes para revisar.</Alert>
          )}
          <TablaChequeoDocumental
            documentos={e.documentos}
            valores={valores}
            soloLectura={soloLectura}
            sucio={sucio}
            guardando={guardar.isPending}
            onGuardar={() => void onGuardar()}
            onVer={setVerDoc}
            onCambiar={(tipoCodigo, cambio) => {
              setValores((m) => ({ ...m, [tipoCodigo]: { resultado: '', observacion: '', ...m[tipoCodigo], ...cambio } }));
              setSucio(true);
            }}
          />
        </div>
      </div>

      {puedeDictaminar && (
        <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-2 border border-ink bg-white px-4 py-3">
          <p className="text-sm">{sucio ? 'Guarde el chequeo antes de emitir el dictamen.' : 'Revise el chequeo y emita el dictamen final.'}</p>
          <Button onClick={() => setDictamenAbierto(true)} disabled={sucio}>
            Emitir dictamen
          </Button>
        </div>
      )}

      {puedeDictaminar && (
        <DictamenFinalModal
          key={`${e.postulacion.id}-${e.postulacion.version}`}
          abierto={dictamenAbierto}
          expediente={e}
          onCerrar={() => setDictamenAbierto(false)}
          onFinalizado={() => {
            setDictamenAbierto(false);
            setAviso({ tipo: 'exito', texto: 'Dictamen emitido. El beneficiario sera notificado.' });
            void refetch();
          }}
          onConflicto={(m) => void manejarConflicto(m)}
        />
      )}

      <VisorDocumentoModal
        documentoId={verDoc?.documento?.documento_id ?? null}
        titulo={verDoc?.tipo_nombre ?? 'Documento'}
        onCerrar={() => setVerDoc(null)}
      />
    </>
  );
}

export function EvaluacionAdminPage() {
  return <EvaluacionExpedientePage soloLecturaForzada />;
}
