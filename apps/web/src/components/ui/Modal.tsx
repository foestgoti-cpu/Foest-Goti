import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Checkbox } from './Checkbox';

/**
 * Modal accesible. Con `confirmacion` se convierte en modal de DOBLE INTENCION
 * (admin_dashboard.md): exige marcar la casilla de comprension y escribir la
 * palabra de confirmacion antes de habilitar la accion.
 */
export interface ConfirmacionDoble {
  /** Texto que el usuario debe escribir exactamente (p. ej. "CONFIRMAR" o el nombre de la entidad). */
  palabra: string;
  /** Texto de la casilla de comprension. */
  comprension: string;
}

export interface ModalProps {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  onConfirmar?: () => void | Promise<void>;
  textoConfirmar?: string;
  textoCancelar?: string;
  confirmacion?: ConfirmacionDoble;
  cargando?: boolean;
  children?: ReactNode;
}

export function Modal({
  abierto,
  titulo,
  onCerrar,
  onConfirmar,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  confirmacion,
  cargando = false,
  children,
}: ModalProps) {
  const tituloId = useId();
  const dialogoRef = useRef<HTMLDivElement>(null);
  const [comprendido, setComprendido] = useState(false);
  const [palabra, setPalabra] = useState('');

  useEffect(() => {
    if (!abierto) {
      setComprendido(false);
      setPalabra('');
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', onKey);
    dialogoRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const listo = !confirmacion || (comprendido && palabra.trim() === confirmacion.palabra);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={onCerrar}>
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="w-full max-w-lg border border-ink bg-white"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="border-b border-ink bg-primary-10 px-4 py-3">
          <h2 id={tituloId} className="text-base font-semibold">
            {titulo}
          </h2>
        </header>
        <div className="px-4 py-4 text-base">
          {children}
          {confirmacion && (
            <div className="mt-4 border-t border-ink pt-4">
              <Checkbox
                etiqueta={confirmacion.comprension}
                checked={comprendido}
                onChange={(e) => setComprendido(e.target.checked)}
              />
              <label className="mt-3 block text-sm font-semibold" htmlFor={`${tituloId}-palabra`}>
                Escriba <span className="font-mono">{confirmacion.palabra}</span> para continuar
              </label>
              <Input
                id={`${tituloId}-palabra`}
                className="mt-1"
                value={palabra}
                onChange={(e) => setPalabra(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-ink px-4 py-3">
          <Button variante="secundario" onClick={onCerrar} disabled={cargando}>
            {textoCancelar}
          </Button>
          {onConfirmar && (
            <Button onClick={() => void onConfirmar()} disabled={!listo} cargando={cargando}>
              {textoConfirmar}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
