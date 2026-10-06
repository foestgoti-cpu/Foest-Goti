import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Mensajes de estado. Error/exito/aviso se expresan con texto y bordes dentro
 * de la paleta (nunca rojo/verde). `tipo` define el prefijo textual y `role`.
 */
export type TipoAlerta = 'info' | 'exito' | 'advertencia' | 'error';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tipo?: TipoAlerta;
  titulo?: ReactNode;
}

const prefijos: Record<TipoAlerta, string> = {
  info: 'Informacion',
  exito: 'Operacion exitosa',
  advertencia: 'Atencion',
  error: 'Error',
};

const estilos: Record<TipoAlerta, string> = {
  info: 'border-primary bg-primary-10',
  exito: 'border-primary bg-white',
  advertencia: 'border-ink bg-primary-10',
  error: 'border-2 border-ink bg-white',
};

export function Alert({ tipo = 'info', titulo, className, children, ...rest }: AlertProps) {
  return (
    <div
      role={tipo === 'error' || tipo === 'advertencia' ? 'alert' : 'status'}
      className={cn('border px-4 py-3 text-ink', estilos[tipo], className)}
      {...rest}
    >
      <p className="text-sm font-semibold uppercase tracking-wide">{titulo ?? prefijos[tipo]}</p>
      <div className="mt-1 text-base">{children}</div>
    </div>
  );
}
