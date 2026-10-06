import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  etiqueta: ReactNode;
  descripcion?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { etiqueta, descripcion, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 cursor-pointer border border-ink accent-primary"
        {...rest}
      />
      <label htmlFor={inputId} className="cursor-pointer text-base leading-6">
        <span>{etiqueta}</span>
        {descripcion && <span className="block text-sm text-ink/70">{descripcion}</span>}
      </label>
    </div>
  );
});
