import { useEffect, useState } from 'react';
import { RestablecerClaveSchema } from '@foest/shared';
import type { ZodError } from 'zod';
import { Alert, Button, FormField, Modal, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { useRestablecerClave } from '../hooks/useFuncionarios';

export interface RestablecerClaveModalProps {
  abierto: boolean;
  funcionarioId: string | null;
  etiquetaCuenta: string;
  onCerrar: () => void;
}

/**
 * Modal de doble intencion para restablecer la contrasena de un funcionario. Al exito muestra la
 * clave temporal UNA sola vez; se descarta al cerrar el modal y no se guarda en ningun almacenamiento.
 */
export function RestablecerClaveModal({ abierto, funcionarioId, etiquetaCuenta, onCerrar }: RestablecerClaveModalProps) {
  const restablecer = useRestablecerClave();
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<ZodError | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [errorCopia, setErrorCopia] = useState(false);

  useEffect(() => {
    if (!abierto) {
      setMotivo('');
      setErrores(null);
      setCopiada(false);
      setErrorCopia(false);
      restablecer.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const clave = restablecer.data?.clave_temporal ?? null;
  const mensajeError =
    restablecer.error instanceof ApiRequestError || restablecer.error instanceof Error ? (restablecer.error as Error).message : null;

  const confirmar = async () => {
    if (!funcionarioId) return;
    const r = RestablecerClaveSchema.safeParse({ motivo, confirmar: true });
    if (!r.success) {
      setErrores(r.error);
      return;
    }
    setErrores(null);
    try {
      await restablecer.mutateAsync({ id: funcionarioId, dto: r.data });
    } catch {
      // El error se muestra dentro del modal.
    }
  };

  const copiar = async () => {
    if (!clave) return;
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
      setErrorCopia(false);
    } catch {
      setErrorCopia(true);
    }
  };

  if (clave) {
    return (
      <Modal abierto={abierto} titulo="Contrasena temporal generada" onCerrar={onCerrar} textoCancelar="Cerrar">
        <Alert tipo="advertencia" className="mb-3">
          Esta clave se muestra una sola vez. Al cerrar esta ventana no podra consultarla de nuevo. Entreguela al funcionario por un canal seguro; nunca por
          correo ni mensajes sin cifrar.
        </Alert>
        <p className="mb-2">
          Clave temporal de <strong>{etiquetaCuenta}</strong>. Las sesiones activas fueron cerradas y el funcionario debera cambiarla al iniciar sesion.
        </p>
        <div className="flex flex-wrap items-center gap-2 border border-ink rounded-lg bg-primary-10 p-3">
          <code className="break-all font-mono text-lg" data-testid="clave-temporal">
            {clave}
          </code>
          <Button variante="secundario" onClick={() => void copiar()}>
            {copiada ? 'Copiada' : 'Copiar'}
          </Button>
        </div>
        {errorCopia && (
          <Alert tipo="error" className="mt-3">
            No fue posible copiar automaticamente; seleccione la clave y copiela manualmente.
          </Alert>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Restablecer contrasena"
      onCerrar={onCerrar}
      onConfirmar={confirmar}
      textoConfirmar="Restablecer contrasena"
      cargando={restablecer.isPending}
      confirmacion={{
        palabra: 'RESTABLECER',
        comprension: `Entiendo que se cerraran las sesiones de ${etiquetaCuenta} y que la clave temporal se mostrara una sola vez.`,
      }}
    >
      <p className="mb-3">
        Se generara una contrasena temporal para {etiquetaCuenta}. El funcionario estara obligado a cambiarla en su proximo inicio de sesion.
      </p>
      {mensajeError && (
        <Alert tipo="error" className="mb-3">
          {mensajeError}
        </Alert>
      )}
      <FormField etiqueta="Motivo" nombre="motivo" error={errores} obligatorio ayuda="Minimo 15 caracteres. Queda registrado en la auditoria.">
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
      </FormField>
    </Modal>
  );
}
