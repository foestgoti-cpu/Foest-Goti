import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalido?: boolean;
}

function IconoOjo({ tachado }: { tachado: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
      {tachado && <path d="M3 3l18 18" />}
    </svg>
  );
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalido, className, type, ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  const clases = cn('campo', invalido && 'campo-error', className);

  if (type !== 'password') {
    return <input ref={ref} type={type} className={clases} aria-invalid={invalido || undefined} {...rest} />;
  }

  return (
    <div className="relative">
      <input ref={ref} type={visible ? 'text' : 'password'} className={cn(clases, 'pr-12')} aria-invalid={invalido || undefined} {...rest} />
      <button
        type="button"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        disabled={rest.disabled}
        tabIndex={0}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-0 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-ink hover:bg-primary-10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <IconoOjo tachado={visible} />
      </button>
    </div>
  );
});
