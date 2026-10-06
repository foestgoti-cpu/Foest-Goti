import { useEffect, useState } from 'react';
import { CorregirDocumentoSchema, TIPOS_DOCUMENTO_IDENTIDAD, type CorregirDocumentoDto } from '@foest/shared';
import type { ZodError } from 'zod';
import { Alert, FormField, Input, Modal, Select, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';

export interface CorregirDocumentoModalProps {
  abierto: boolean;
  tipoActual: string | null;
  numeroActual: string | null;
  cargando?: boolean;
  error?: unknown;
  onCerrar: () => void;
  onConfirmar: (dto: CorregirDocumentoDto) => void | Promise<void>;
}

const MENSAJES: Record<string, string> = {
  DOCUMENTO_DUPLICADO: 'Ya existe otro beneficiario registrado con ese numero de documento.',
  ESTADO_SIN_CAMBIO: 'El documento indicado es igual al actual.',
  PERFIL_ANONIMIZADO: 'El perfil fue anonimizado y no admite cambios.',
};

/** Correccion administrativa del documento de identidad con motivo obligatorio y doble intencion. */
export function CorregirDocumentoModal({ abierto, tipoActual, numeroActual, cargando, error, onCerrar, onConfirmar }: CorregirDocumentoModalProps) {
  const [tipo, setTipo] = useState(tipoActual ?? '');
  const [numero, setNumero] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<ZodError | null>(null);

  useEffect(() => {
    if (abierto) {
      setTipo(tipoActual ?? '');
      setNumero('');
      setMotivo('');
      setErrores(null);
    }
  }, [abierto, tipoActual]);

  const confirmar = async () => {
    const r = CorregirDocumentoSchema.safeParse({ ...(tipo ? { tipo_documento: tipo } : {}), numero_documento: numero, motivo });
    if (!r.success) {
      setErrores(r.error);
      return;
    }
    setErrores(null);
    await onConfirmar(r.data);
  };

  const mensajeError = error instanceof ApiRequestError ? (MENSAJES[error.code] ?? error.message) : error instanceof Error ? error.message : null;

  return (
    <Modal
      abierto={abierto}
      titulo="Corregir documento de identidad"
      onCerrar={onCerrar}
      onConfirmar={confirmar}
      textoConfirmar="Corregir documento"
      cargando={cargando}
      confirmacion={{ palabra: 'CORREGIR', comprension: 'Entiendo que el cambio queda registrado en la auditoria con el valor anterior y el nuevo, y que el titular sera notificado.' }}
    >
      <p className="mb-3 text-sm">
        Documento actual: <span className="font-mono">{tipoActual ?? '-'} {numeroActual ?? '-'}</span>
      </p>
      {mensajeError && (
        <Alert tipo="error" className="mb-3">
          {mensajeError}
        </Alert>
      )}
      <FormField etiqueta="Tipo de documento" nombre="tipo_documento" error={errores}>
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Conservar el actual" opciones={TIPOS_DOCUMENTO_IDENTIDAD.map((t) => ({ valor: t, etiqueta: t }))} />
      </FormField>
      <FormField etiqueta="Nuevo numero de documento" nombre="numero_documento" error={errores} obligatorio>
        <Input value={numero} onChange={(e) => setNumero(e.target.value)} autoComplete="off" />
      </FormField>
      <FormField etiqueta="Motivo de la correccion" nombre="motivo" error={errores} obligatorio ayuda="Minimo 15 caracteres.">
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
      </FormField>
    </Modal>
  );
}
