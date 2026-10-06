import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalido?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalido, className, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea ref={ref} rows={rows} className={cn('campo', invalido && 'campo-error', className)} aria-invalid={invalido || undefined} {...rest} />
  );
});
