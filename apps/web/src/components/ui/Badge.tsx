import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * Insignia de estado. Sin colores semanticos: se diferencia por
 * borde y relleno dentro de la paleta. El texto describe el estado (accesible).
 */
export type TonoBadge = 'neutro' | 'destacado' | 'relleno';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tono?: TonoBadge;
}

const tonos: Record<TonoBadge, string> = {
  neutro: 'border-ink bg-white text-ink',
  destacado: 'border-primary bg-primary-10 text-ink',
  relleno: 'border-primary bg-primary text-white',
};

export function Badge({ tono = 'neutro', className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium uppercase tracking-wide', tonos[tono], className)} {...rest}>
      {children}
    </span>
  );
}
