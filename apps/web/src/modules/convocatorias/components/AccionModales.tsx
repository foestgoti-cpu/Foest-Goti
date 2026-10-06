import { useState } from 'react';
import { Alert, FormField, Input, Modal, Textarea } from '../../../components/ui';
import type { ConvocatoriaDetalle } from '../types';
import { formatearFechaLocal, mensajeDeError } from '../utils';

/**
 * Modales de doble intencion para las transiciones de estado. Todos exigen marcar
 * la casilla de comprension y escribir la palabra de confirmacion; los que lo
 * requieren piden ademas un motivo (minimo 15 caracteres).
 */
export const MOTIVO_MINIMO = 15;

interface Base {
  convocatoria: ConvocatoriaDetalle;
  abierto: boolean;
  cargando: boolean;
  error: unknown;
  onCerrar: () => void;
}

export function HabilitarModal({ convocatoria, abierto, cargando, error, onCerrar, onConfirmar }: Base & { onConfirmar: () => void }) {
  return (
    <Modal
      abierto={abierto}
      titulo="Habilitar convocatoria"
      onCerrar={onCerrar}
      onConfirmar={onConfirmar}
      textoConfirmar="Habilitar"
      cargando={cargando}
      confirmacion={{ palabra: 'HABILITAR', comprension: 'Entiendo que la convocatoria sera visible publicamente y recibira postulaciones en las fechas definidas.' }}
    >
      {error ? (
        <Alert tipo="error" className="mb-3">
          {mensajeDeError(error)}
        </Alert>
      ) : null}
      <p>
        Se habilitara la convocatoria <strong>{convocatoria.nombre}</strong>. Estara abierta desde el {formatearFechaLocal(convocatoria.fecha_apertura_local)} hasta
        el {formatearFechaLocal(convocatoria.fecha_cierre)} a las 23:59:59.
      </p>
      <p className="mt-2 text-sm">Requisitos: al menos un beneficio ofertado y al menos un funcionario en el comite.</p>
    </Modal>
  );
}

export function DeshabilitarModal({ convocatoria, abierto, cargando, error, onCerrar, onConfirmar }: Base & { onConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const invalido = motivo.trim().length < MOTIVO_MINIMO;
  return (
    <Modal
      abierto={abierto}
      titulo="Suspender convocatoria"
      onCerrar={onCerrar}
      onConfirmar={() => {
        if (!invalido) onConfirmar(motivo.trim());
      }}
      textoConfirmar="Suspender"
      cargando={cargando}
      confirmacion={{ palabra: 'SUSPENDER', comprension: 'Entiendo que los beneficiarios con borrador no podran enviar su postulacion mientras dure la suspension.' }}
    >
      {error ? (
        <Alert tipo="error" className="mb-3">
          {mensajeDeError(error)}
        </Alert>
      ) : null}
      <p>
        La convocatoria <strong>{convocatoria.nombre}</strong> pasara a estado Suspendida. Las postulaciones ya enviadas continuan su evaluacion; los borradores se
        conservan y los beneficiarios seran notificados.
      </p>
      <div className="mt-3">
        <FormField etiqueta="Motivo de la suspension" nombre="motivo" obligatorio error={motivo.length > 0 && invalido ? `Minimo ${MOTIVO_MINIMO} caracteres` : null}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={2000} />
        </FormField>
      </div>
    </Modal>
  );
}

export function RehabilitarModal({ convocatoria, abierto, cargando, error, onCerrar, onConfirmar }: Base & { onConfirmar: () => void }) {
  return (
    <Modal
      abierto={abierto}
      titulo="Rehabilitar convocatoria"
      onCerrar={onCerrar}
      onConfirmar={onConfirmar}
      textoConfirmar="Rehabilitar"
      cargando={cargando}
      confirmacion={{ palabra: 'REHABILITAR', comprension: 'Entiendo que la convocatoria volvera a recibir postulaciones de inmediato.' }}
    >
      {error ? (
        <Alert tipo="error" className="mb-3">
          {mensajeDeError(error)}
        </Alert>
      ) : null}
      <p>
        La convocatoria <strong>{convocatoria.nombre}</strong> volvera al estado Habilitada. Cierra el {formatearFechaLocal(convocatoria.fecha_cierre)} a las 23:59:59.
      </p>
      {convocatoria.motivo_suspension && <p className="mt-2 text-sm">Motivo de la suspension vigente: {convocatoria.motivo_suspension}</p>}
    </Modal>
  );
}

export function AmpliarModal({
  convocatoria,
  abierto,
  cargando,
  error,
  onCerrar,
  onConfirmar,
}: Base & { onConfirmar: (datos: { fecha_cierre_nueva: string; motivo: string }) => void }) {
  const [fecha, setFecha] = useState('');
  const [motivo, setMotivo] = useState('');
  const reapertura = convocatoria.estado === 'CERRADA';
  const fechaInvalida = !fecha || (!reapertura && fecha <= convocatoria.fecha_cierre);
  const motivoInvalido = motivo.trim().length < MOTIVO_MINIMO;
  return (
    <Modal
      abierto={abierto}
      titulo={reapertura ? 'Reabrir convocatoria' : 'Ampliar plazo de cierre'}
      onCerrar={onCerrar}
      onConfirmar={() => {
        if (!fechaInvalida && !motivoInvalido) onConfirmar({ fecha_cierre_nueva: fecha, motivo: motivo.trim() });
      }}
      textoConfirmar={reapertura ? 'Reabrir' : 'Ampliar plazo'}
      cargando={cargando}
      confirmacion={{
        palabra: reapertura ? 'REABRIR' : 'AMPLIAR',
        comprension: reapertura
          ? 'Entiendo que la convocatoria cerrada volvera a estado Habilitada y los borradores podran enviarse de nuevo.'
          : 'Entiendo que la nueva fecha de cierre reemplaza a la vigente y quedara registrada con su motivo.',
      }}
    >
      {error ? (
        <Alert tipo="error" className="mb-3">
          {mensajeDeError(error)}
        </Alert>
      ) : null}
      <p>
        Cierre vigente: <strong>{formatearFechaLocal(convocatoria.fecha_cierre)}</strong> a las 23:59:59.
      </p>
      <div className="mt-3">
        <FormField
          etiqueta="Nueva fecha de cierre"
          nombre="fecha_cierre_nueva"
          obligatorio
          ayuda="Ultimo dia habilitado para postularse (hasta las 23:59:59, hora de Colombia)."
          error={fecha && fechaInvalida ? 'La nueva fecha debe ser posterior al cierre vigente' : null}
        >
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </FormField>
        <FormField etiqueta="Motivo" nombre="motivo" obligatorio error={motivo.length > 0 && motivoInvalido ? `Minimo ${MOTIVO_MINIMO} caracteres` : null}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={2000} />
        </FormField>
      </div>
    </Modal>
  );
}

export function ArchivarModal({ convocatoria, abierto, cargando, error, onCerrar, onConfirmar }: Base & { onConfirmar: () => void }) {
  const enCurso = (convocatoria.postulaciones_por_estado.BORRADOR ?? 0) + (convocatoria.postulaciones_por_estado.PENDIENTE ?? 0) +
    (convocatoria.postulaciones_por_estado.EN_EVALUACION ?? 0) + (convocatoria.postulaciones_por_estado.EN_CORRECCION ?? 0);
  return (
    <Modal
      abierto={abierto}
      titulo="Archivar convocatoria"
      onCerrar={onCerrar}
      onConfirmar={onConfirmar}
      textoConfirmar="Archivar"
      cargando={cargando}
      confirmacion={{ palabra: 'ARCHIVAR', comprension: 'Entiendo que el archivado es definitivo y la convocatoria quedara en solo lectura.' }}
    >
      {error ? (
        <Alert tipo="error" className="mb-3">
          {mensajeDeError(error)}
        </Alert>
      ) : null}
      <p>
        La convocatoria <strong>{convocatoria.nombre}</strong> pasara a estado Archivada. Solo es posible cuando todas las postulaciones estan en estado terminal
        (aprobada, rechazada o desistida).
      </p>
      {enCurso > 0 && (
        <Alert tipo="advertencia" className="mt-3">
          Existen {enCurso} postulacion(es) en curso; la API rechazara el archivado hasta que concluyan.
        </Alert>
      )}
    </Modal>
  );
}
