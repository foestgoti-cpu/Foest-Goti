import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type VarianteBoton = 'primario' | 'secundario' | 'texto';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  cargando?: boolean;
  bloque?: boolean;
}

const base =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 py-2 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const variantes: Record<VarianteBoton, string> = {
  primario: 'border-primary bg-primary text-white hover:bg-primary/90',
  secundario: 'border-ink bg-white text-ink hover:bg-primary-10',
  texto: 'border-transparent bg-transparent text-primary hover:bg-primary-10',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante = 'primario', cargando = false, bloque = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variantes[variante], bloque && 'w-full', className)}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...rest}
    >
      {cargando ? 'Procesando...' : children}
    </button>
  );
});
