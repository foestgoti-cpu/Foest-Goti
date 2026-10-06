import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalido?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalido, className, ...rest }, ref) {
  return <input ref={ref} className={cn('campo', invalido && 'campo-error', className)} aria-invalid={invalido || undefined} {...rest} />;
});
