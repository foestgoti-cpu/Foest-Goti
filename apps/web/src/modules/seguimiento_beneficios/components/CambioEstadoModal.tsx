import { useState } from 'react';
import type { OtorgamientoDetalleDto } from '@foest/shared';
import { Alert, Checkbox, FormField, Modal, Textarea } from '../../../components/ui';
import type { AccionEstado } from '../types';
import { MOTIVO_MINIMO, formatearMoneda, mensajeDeError, nombreBeneficio } from '../utils';

const CONFIG: Record<AccionEstado, { titulo: string; boton: string; palabra: string; comprension: string }> = {
  SUSPENDER: { titulo: 'Suspender otorgamiento', boton: 'Suspender', palabra: 'SUSPENDER', comprension: 'Entiendo que los desembolsos programados no se podran pagar mientras el otorgamiento este suspendido.' },
  REVOCAR: { titulo: 'Revocar otorgamiento', boton: 'Revocar', palabra: 'REVOCAR', comprension: 'Entiendo que la revocatoria es definitiva y no se puede deshacer.' },
  REACTIVAR: { titulo: 'Reactivar otorgamiento', boton: 'Reactivar', palabra: 'REACTIVAR', comprension: 'Entiendo que el otorgamiento volvera a estado Activo y podra recibir desembolsos.' },
  CUMPLIR: { titulo: 'Marcar otorgamiento como cumplido', boton: 'Marcar cumplido', palabra: 'CUMPLIR', comprension: 'Entiendo que el otorgamiento se cerrara como cumplido y es un estado final.' },
};

interface Props {
  accion: AccionEstado;
  otorgamiento: OtorgamientoDetalleDto;
  cargando: boolean;
  error: unknown;
  onCerrar: () => void;
  onConfirmar: (datos: { motivo: string; forzar?: boolean }) => void;
}

/** Modal de doble intencion para suspender, revocar, reactivar o cumplir. Motivo minimo 15 caracteres. */
export function CambioEstadoModal({ accion, otorgamiento, cargando, error, onCerrar, onConfirmar }: Props) {
  const [motivo, setMotivo] = useState('');
  const [forzar, setForzar] = useState(false);
  const cfg = CONFIG[accion];
  const pendientes = otorgamiento.desembolsos.filter((d) => d.estado === 'PROGRAMADO');
  const exigeForzar = accion === 'CUMPLIR' && pendientes.length > 0;
  const motivoInvalido = motivo.trim().length < MOTIVO_MINIMO;

  return (
    <Modal
      abierto
      titulo={cfg.titulo}
      onCerrar={onCerrar}
      onConfirmar={() => {
        if (motivoInvalido || (exigeForzar && !forzar)) return;
        onConfirmar({ motivo: motivo.trim(), ...(exigeForzar ? { forzar: true } : {}) });
      }}
      textoConfirmar={cfg.boton}
      cargando={cargando}
      confirmacion={{ palabra: cfg.palabra, comprension: cfg.comprension }}
    >
      {error ? (
        <Alert tipo="error" className="mb-3">
          {mensajeDeError(error)}
        </Alert>
      ) : null}
      <p>
        Otorgamiento de <strong>{otorgamiento.beneficiario_nombre ?? 'beneficiario'}</strong>, beneficio {nombreBeneficio(otorgamiento.beneficio_codigo, otorgamiento.beneficio_nombre)} por{' '}
        {formatearMoneda(otorgamiento.monto_aprobado)}.
      </p>
      {accion === 'REVOCAR' && (
        <Alert tipo="advertencia" className="mt-3">
          La revocatoria no diligencia el pagare. Si el beneficiario ya recibio pagos, la gestion del pagare debe realizarse por separado.
        </Alert>
      )}
      {exigeForzar && (
        <Alert tipo="advertencia" className="mt-3">
          Hay {pendientes.length} desembolso(s) programado(s) sin pagar. Para marcar el otorgamiento como cumplido deben anularse.
          <Checkbox className="mt-2" etiqueta="Autorizo anular los desembolsos pendientes" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />
        </Alert>
      )}
      <div className="mt-3">
        <FormField etiqueta="Motivo" nombre="motivo" obligatorio ayuda={`Minimo ${MOTIVO_MINIMO} caracteres.`} error={motivo.length > 0 && motivoInvalido ? `Minimo ${MOTIVO_MINIMO} caracteres` : null}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={2000} />
        </FormField>
      </div>
    </Modal>
  );
}
