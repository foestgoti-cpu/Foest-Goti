import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import type { ZodError, ZodIssue } from 'zod';

/**
 * Envuelve un control de formulario con etiqueta, ayuda y mensaje de error.
 * Acepta errores de Zod (`error` como ZodError + `nombre` del campo) o un texto.
 *
 *   <FormField etiqueta="Correo" nombre="email" error={zodError} obligatorio>
 *     <Input name="email" />
 *   </FormField>
 */
export interface FormFieldProps {
  etiqueta: ReactNode;
  nombre?: string;
  ayuda?: ReactNode;
  error?: string | ZodError | ZodIssue[] | null;
  obligatorio?: boolean;
  children: ReactElement<{ id?: string; name?: string; invalido?: boolean; 'aria-describedby'?: string; required?: boolean }>;
}

export function mensajeDeError(error: FormFieldProps['error'], nombre?: string): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error;
  const issues: ZodIssue[] = Array.isArray(error) ? error : error.issues;
  const propio = nombre ? issues.filter((i) => i.path.join('.') === nombre) : issues;
  return propio[0]?.message ?? null;
}

export function FormField({ etiqueta, nombre, ayuda, error, obligatorio, children }: FormFieldProps) {
  const id = useId();
  const inputId = children.props.id ?? `${nombre ?? 'campo'}-${id}`;
  const mensaje = mensajeDeError(error, nombre);
  const ayudaId = ayuda ? `${inputId}-ayuda` : undefined;
  const errorId = mensaje ? `${inputId}-error` : undefined;
  const describedBy = [ayudaId, errorId].filter(Boolean).join(' ') || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: inputId,
        name: children.props.name ?? nombre,
        invalido: Boolean(mensaje),
        'aria-describedby': describedBy,
        required: obligatorio || children.props.required,
      })
    : children;

  return (
    <div className="mb-4">
      <label htmlFor={inputId} className="mb-1 block text-sm font-semibold">
        {etiqueta}
        {obligatorio && (
          <span className="ml-1 text-ink/70" aria-hidden="true">
            (obligatorio)
          </span>
        )}
      </label>
      {control}
      {ayuda && (
        <p id={ayudaId} className="mt-1 text-sm text-ink/70">
          {ayuda}
        </p>
      )}
      {mensaje && (
        <p id={errorId} role="alert" className="mt-1 border-l-2 border-ink pl-2 text-sm font-medium">
          {mensaje}
        </p>
      )}
    </div>
  );
}
