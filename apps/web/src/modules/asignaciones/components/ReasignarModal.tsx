import { useEffect, useState } from 'react';
import { Alert, FormField, Modal, Select, Textarea } from '../../../components/ui';
import { useEvaluadores, useReasignar } from '../hooks/useAsignaciones';
import { mensajeError } from './AccionExpedienteModal';

const MOTIVO_MIN = 15;

interface Props {
  abierto: boolean;
  postulacionId: string;
  codigoExpediente?: string | null;
  /** Funcionario titular actual, excluido de las opciones de destino. */
  titularId?: string | null;
  onCerrar: () => void;
  onExito: (mensaje: string) => void;
}

/** Reasignacion individual con doble intencion: funcionario destino del comite y motivo obligatorio. */
export function ReasignarModal({ abierto, postulacionId, codigoExpediente, titularId, onCerrar, onExito }: Props) {
  // Con el id del expediente el API marca excluidos (conflicto de interes) y funcionarios fuera del comite.
  const { data: evaluadores, isLoading } = useEvaluadores(postulacionId, abierto);
  const reasignar = useReasignar();
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setDestino('');
      setMotivo('');
      setError(null);
    }
  }, [abierto, postulacionId]);

  const opciones = (evaluadores ?? [])
    .filter((e) => e.activo && e.funcionario_id !== titularId && !e.excluido && e.en_comite_postulacion !== false)
    .map((e) => ({ valor: e.funcionario_id, etiqueta: e.nombre }));

  const confirmar = async () => {
    if (!destino) {
      setError('Seleccione el funcionario destino.');
      return;
    }
    if (motivo.trim().length < MOTIVO_MIN) {
      setError(`El motivo debe tener al menos ${MOTIVO_MIN} caracteres.`);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      await reasignar.mutateAsync({ id: postulacionId, body: { funcionario_id: destino, motivo: motivo.trim() } });
      onExito('Expediente reasignado correctamente.');
      onCerrar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo="Reasignar expediente"
      onCerrar={onCerrar}
      onConfirmar={confirmar}
      textoConfirmar="Reasignar"
      cargando={cargando}
      confirmacion={{ palabra: 'REASIGNAR', comprension: 'Entiendo que la asignacion actual se cerrara y el cambio quedara auditado.' }}
    >
      <p>Expediente {codigoExpediente ? <span className="font-semibold">{codigoExpediente}</span> : 'seleccionado'}.</p>
      <div className="mt-4">
        <FormField etiqueta="Funcionario destino" nombre="destino" obligatorio ayuda="Solo se listan funcionarios activos del comite de la convocatoria, sin conflicto de interes sobre este expediente.">
          <Select placeholder="Seleccione" opciones={opciones} value={destino} disabled={isLoading} onChange={(e) => setDestino(e.target.value)} />
        </FormField>
        <FormField etiqueta="Motivo" nombre="motivo" obligatorio ayuda={`Minimo ${MOTIVO_MIN} caracteres.`}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </FormField>
      </div>
      {error && <Alert tipo="error">{error}</Alert>}
    </Modal>
  );
}
