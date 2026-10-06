import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface OpcionSelect {
  valor: string;
  etiqueta: string;
  deshabilitada?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  opciones: OpcionSelect[];
  placeholder?: string;
  invalido?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { opciones, placeholder, invalido, className, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn('campo', invalido && 'campo-error', className)} aria-invalid={invalido || undefined} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor} disabled={o.deshabilitada}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
});
