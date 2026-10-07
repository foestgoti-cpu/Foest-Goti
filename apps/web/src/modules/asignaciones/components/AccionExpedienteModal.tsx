import { useEffect, useState } from 'react';
import { ApiRequestError } from '../../../lib/api';
import { Alert, FormField, Modal, Textarea } from '../../../components/ui';
import { useConflicto, useLiberar, useTomar } from '../hooks/useAsignaciones';
import type { ResumenBandejaDto } from '@foest/shared';

export type AccionExpediente = 'TOMAR' | 'LIBERAR' | 'CONFLICTO';

const MOTIVO_MIN = 15;

const TEXTOS: Record<AccionExpediente, { titulo: string; boton: string; comprension: string }> = {
  TOMAR: {
    titulo: 'Tomar expediente',
    boton: 'Tomar expediente',
    comprension: 'Entiendo que el expediente quedara asignado a mi y pasara a evaluacion.',
  },
  LIBERAR: {
    titulo: 'Liberar expediente',
    boton: 'Liberar',
    comprension: 'Entiendo que el expediente volvera al pool y dejara de estar a mi cargo.',
  },
  CONFLICTO: {
    titulo: 'Declarar conflicto de interes',
    boton: 'Declarar conflicto',
    comprension: 'Entiendo que la exclusion es permanente y que no podre volver a ver este expediente.',
  },
};

export function mensajeError(e: unknown): string {
  if (e instanceof ApiRequestError) {
    if (e.code === 'YA_ASIGNADA') return 'Otro funcionario ya tomo este expediente. La bandeja se actualizo; seleccione otro expediente.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'No fue posible completar la operacion.';
}

interface Props {
  accion: AccionExpediente | null;
  fila: ResumenBandejaDto | null;
  onCerrar: () => void;
  onExito: (mensaje: string) => void;
}

/** Modal de doble intencion para tomar, liberar o declarar conflicto de interes sobre un expediente. */
export function AccionExpedienteModal({ accion, fila, onCerrar, onExito }: Props) {
  const tomar = useTomar();
  const liberar = useLiberar();
  const conflicto = useConflicto();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setMotivo('');
    setError(null);
    setCargando(false);
  }, [accion, fila?.postulacion_id]);

  if (!accion || !fila) return null;
  const t = TEXTOS[accion];
  const motivoInvalido = accion === 'CONFLICTO' && motivo.trim().length < MOTIVO_MIN;

  const confirmar = async () => {
    if (motivoInvalido) {
      setError(`El motivo debe tener al menos ${MOTIVO_MIN} caracteres.`);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      if (accion === 'TOMAR') await tomar.mutateAsync({ id: fila.postulacion_id, version: fila.version });
      else if (accion === 'LIBERAR') await liberar.mutateAsync({ id: fila.postulacion_id, version: fila.version });
      else await conflicto.mutateAsync({ id: fila.postulacion_id, motivo: motivo.trim(), version: fila.version });
      onExito(`${t.titulo}: expediente ${fila.codigo_expediente}, operacion registrada.`);
      onCerrar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={t.titulo}
      onCerrar={onCerrar}
      onConfirmar={confirmar}
      textoConfirmar={t.boton}
      cargando={cargando}
      confirmacion={{ palabra: 'CONFIRMAR', comprension: t.comprension }}
    >
      <p>
        Expediente <span className="font-semibold">{fila.codigo_expediente}</span> de la convocatoria {fila.convocatoria_nombre}.
      </p>
      {accion === 'CONFLICTO' && (
        <div className="mt-4">
          <FormField
            etiqueta="Motivo del impedimento"
            nombre="motivo"
            obligatorio
            ayuda={`Minimo ${MOTIVO_MIN} caracteres. Queda registrado en la auditoria y se informa al administrador.`}
          >
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </FormField>
        </div>
      )}
      {error && (
        <Alert tipo="error" className="mt-4">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
