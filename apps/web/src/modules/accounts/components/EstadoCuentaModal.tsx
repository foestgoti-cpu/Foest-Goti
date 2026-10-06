import { useEffect, useState } from 'react';
import { CambiarEstadoCuentaSchema, type CambiarEstadoCuentaDto } from '@foest/shared';
import type { ZodError } from 'zod';
import { Alert, Checkbox, FormField, Modal, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { AsignacionesPendientesAviso } from './AsignacionesPendientesAviso';
import type { PendientesFuncionario } from '../types';

export interface EstadoCuentaModalProps {
  abierto: boolean;
  /** Nombre o correo de la cuenta afectada (se usa como palabra de confirmacion al deshabilitar). */
  etiquetaCuenta: string;
  /** `true` para activar, `false` para deshabilitar. */
  activar: boolean;
  /** Permite ofrecer "forzar" ante 409 ASIGNACIONES_PENDIENTES (solo funcionarios). */
  permiteForzar?: boolean;
  cargando?: boolean;
  error?: unknown;
  onCerrar: () => void;
  onConfirmar: (dto: CambiarEstadoCuentaDto) => void | Promise<void>;
}

const MENSAJES_409: Record<string, string> = {
  ULTIMO_ADMINISTRADOR: 'No es posible deshabilitar al unico administrador activo de la plataforma.',
  AUTODESHABILITACION_NO_PERMITIDA: 'No puede deshabilitar su propia cuenta. Solicitelo a otro administrador.',
  ESTADO_SIN_CAMBIO: 'La cuenta ya se encuentra en el estado solicitado.',
  INVITACION_YA_ACEPTADA: 'El funcionario ya acepto la invitacion.',
};

/** Modal de doble intencion para activar o deshabilitar una cuenta con motivo obligatorio. */
export function EstadoCuentaModal({ abierto, etiquetaCuenta, activar, permiteForzar, cargando, error, onCerrar, onConfirmar }: EstadoCuentaModalProps) {
  const [motivo, setMotivo] = useState('');
  const [forzar, setForzar] = useState(false);
  const [errores, setErrores] = useState<ZodError | null>(null);

  useEffect(() => {
    if (!abierto) {
      setMotivo('');
      setForzar(false);
      setErrores(null);
    }
  }, [abierto]);

  const pendientes: PendientesFuncionario | null =
    error instanceof ApiRequestError && error.code === 'ASIGNACIONES_PENDIENTES' ? (error.details as PendientesFuncionario) : null;
  const mensajeError =
    error instanceof ApiRequestError && !pendientes ? (MENSAJES_409[error.code] ?? error.message) : error instanceof Error && !pendientes ? error.message : null;

  const confirmar = async () => {
    const r = CambiarEstadoCuentaSchema.safeParse({ activo: activar, motivo, ...(permiteForzar && forzar ? { forzar: true } : {}) });
    if (!r.success) {
      setErrores(r.error);
      return;
    }
    setErrores(null);
    await onConfirmar(r.data);
  };

  return (
    <Modal
      abierto={abierto}
      titulo={activar ? 'Reactivar cuenta' : 'Deshabilitar cuenta'}
      onCerrar={onCerrar}
      onConfirmar={confirmar}
      textoConfirmar={activar ? 'Reactivar' : 'Deshabilitar'}
      cargando={cargando}
      confirmacion={
        activar
          ? undefined
          : { palabra: 'DESHABILITAR', comprension: `Entiendo que la cuenta ${etiquetaCuenta} perdera el acceso a la plataforma de inmediato.` }
      }
    >
      <p className="mb-3">
        {activar
          ? `La cuenta ${etiquetaCuenta} recuperara el acceso a la plataforma.`
          : `La cuenta ${etiquetaCuenta} quedara deshabilitada y sus sesiones activas seran revocadas.`}
      </p>
      {mensajeError && (
        <Alert tipo="error" className="mb-3">
          {mensajeError}
        </Alert>
      )}
      {pendientes && (
        <div className="mb-3">
          <AsignacionesPendientesAviso pendientes={pendientes} />
        </div>
      )}
      <FormField etiqueta="Motivo" nombre="motivo" error={errores} obligatorio ayuda="Minimo 15 caracteres. Queda registrado en la auditoria.">
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
      </FormField>
      {permiteForzar && !activar && pendientes && (
        <Checkbox
          etiqueta="Forzar la deshabilitacion aunque existan expedientes pendientes"
          descripcion="Los expedientes quedaran sin evaluador hasta que se reasignen desde el modulo de asignaciones."
          checked={forzar}
          onChange={(e) => setForzar(e.target.checked)}
        />
      )}
    </Modal>
  );
}
