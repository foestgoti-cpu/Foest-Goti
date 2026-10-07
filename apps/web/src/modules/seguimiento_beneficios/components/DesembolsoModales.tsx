import { useState } from 'react';
import type { DesembolsoDto, OtorgamientoDetalleDto } from '@foest/shared';
import { Alert, Checkbox, FormField, Input, Modal, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { MOTIVO_MINIMO, formatearMoneda, mensajeDeError } from '../utils';

function ErrorBloque({ error }: { error: unknown }) {
  return error ? (
    <Alert tipo="error" className="mb-3">
      {mensajeDeError(error)}
    </Alert>
  ) : null;
}

/** Formulario de programacion; ante 409 EXCEDE_PRESUPUESTO muestra el excedente y pide confirmacion explicita. */
export function ProgramarDesembolsoModal({
  otorgamiento,
  cargando,
  error,
  onCerrar,
  onConfirmar,
}: {
  otorgamiento: OtorgamientoDetalleDto;
  cargando: boolean;
  error: unknown;
  onCerrar: () => void;
  onConfirmar: (d: { monto: number; fecha_programada: string; concepto?: string; confirmar_excedente?: boolean; motivo_excedente?: string }) => void;
}) {
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState('');
  const [concepto, setConcepto] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [motivoExcedente, setMotivoExcedente] = useState('');
  const excede = error instanceof ApiRequestError && error.status === 409 && error.code === 'EXCEDE_PRESUPUESTO';
  const valor = Number(monto.replace(',', '.'));
  const invalido = !(valor > 0) || !fecha;

  return (
    <Modal
      abierto
      titulo="Programar desembolso"
      onCerrar={onCerrar}
      onConfirmar={() => {
        if (invalido || (excede && (!acepta || (motivoExcedente.trim().length > 0 && motivoExcedente.trim().length < MOTIVO_MINIMO)))) return;
        onConfirmar({
          monto: valor,
          fecha_programada: fecha,
          ...(concepto.trim() ? { concepto: concepto.trim() } : {}),
          ...(excede ? { confirmar_excedente: true, ...(motivoExcedente.trim() ? { motivo_excedente: motivoExcedente.trim() } : {}) } : {}),
        });
      }}
      textoConfirmar={excede ? 'Confirmar excedente y programar' : 'Programar'}
      cargando={cargando}
    >
      {excede ? (
        <Alert tipo="advertencia" titulo="Excede el presupuesto o los cupos" className="mb-3">
          <p>{mensajeDeError(error)}</p>
          <p className="mt-2 text-sm">
            {otorgamiento.excede_cupo ? 'El otorgamiento supera el cupo del beneficio. ' : ''}
            {otorgamiento.excede_presupuesto ? 'El otorgamiento supera el presupuesto del beneficio. ' : ''}
            Monto aprobado: {formatearMoneda(otorgamiento.monto_aprobado)}.
          </p>
          <FormField etiqueta="Motivo del excedente (opcional, minimo 15 caracteres)" nombre="motivo_excedente">
            <Textarea value={motivoExcedente} onChange={(e) => setMotivoExcedente(e.target.value)} rows={2} maxLength={2000} />
          </FormField>
          <Checkbox
            className="mt-2"
            etiqueta="Confirmo expresamente que deseo programar este desembolso a pesar del excedente"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
          />
        </Alert>
      ) : (
        <ErrorBloque error={error} />
      )}
      <p className="mb-3 text-sm">
        Monto aprobado: {formatearMoneda(otorgamiento.monto_aprobado)}. Programado: {formatearMoneda(otorgamiento.monto_programado)}. Desembolsado:{' '}
        {formatearMoneda(otorgamiento.monto_desembolsado)}.
      </p>
      <FormField etiqueta="Monto (COP)" nombre="monto" obligatorio>
        <Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </FormField>
      <FormField etiqueta="Fecha programada" nombre="fecha_programada" obligatorio>
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </FormField>
      <p className="-mt-2 mb-4 text-sm text-ink/70">La fecha debe ser un dia habil y no puede ser pasada.</p>
      <FormField etiqueta="Concepto" nombre="concepto">
        <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={200} />
      </FormField>
    </Modal>
  );
}

export function PagarDesembolsoModal({
  desembolso,
  cargando,
  error,
  onCerrar,
  onConfirmar,
}: {
  desembolso: DesembolsoDto;
  cargando: boolean;
  error: unknown;
  onCerrar: () => void;
  onConfirmar: (d: { referencia_pago: string; fecha_pago: string }) => void;
}) {
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState('');
  const invalido = referencia.trim().length < 3 || !fecha;
  return (
    <Modal
      abierto
      titulo="Registrar pago"
      onCerrar={onCerrar}
      onConfirmar={() => {
        if (!invalido) onConfirmar({ referencia_pago: referencia.trim(), fecha_pago: fecha });
      }}
      textoConfirmar="Registrar pago"
      cargando={cargando}
    >
      <ErrorBloque error={error} />
      <p className="mb-3">Desembolso de {formatearMoneda(desembolso.monto)}. El numero de cuenta no se muestra en pantalla.</p>
      <FormField etiqueta="Referencia de pago" nombre="referencia_pago" obligatorio ayuda="Minimo 3 caracteres.">
        <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} />
      </FormField>
      <FormField etiqueta="Fecha de pago" nombre="fecha_pago" obligatorio ayuda="No puede ser posterior a hoy.">
        <Input type="date" max={new Date().toISOString().slice(0, 10)} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </FormField>
    </Modal>
  );
}

export function AnularDesembolsoModal({
  desembolso,
  cargando,
  error,
  onCerrar,
  onConfirmar,
}: {
  desembolso: DesembolsoDto;
  cargando: boolean;
  error: unknown;
  onCerrar: () => void;
  onConfirmar: (d: { motivo: string }) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const invalido = motivo.trim().length < MOTIVO_MINIMO;
  return (
    <Modal
      abierto
      titulo="Anular desembolso"
      onCerrar={onCerrar}
      onConfirmar={() => {
        if (!invalido) onConfirmar({ motivo: motivo.trim() });
      }}
      textoConfirmar="Anular"
      cargando={cargando}
      confirmacion={{ palabra: 'ANULAR', comprension: 'Entiendo que el desembolso anulado no podra pagarse.' }}
    >
      <ErrorBloque error={error} />
      <p>Se anulara el desembolso de {formatearMoneda(desembolso.monto)}.</p>
      <div className="mt-3">
        <FormField etiqueta="Motivo" nombre="motivo" obligatorio error={motivo.length > 0 && invalido ? `Minimo ${MOTIVO_MINIMO} caracteres` : null}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={2000} />
        </FormField>
      </div>
    </Modal>
  );
}
