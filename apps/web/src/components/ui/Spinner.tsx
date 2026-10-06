import { cn } from '../../lib/cn';

export function Spinner({ etiqueta = 'Cargando', className }: { etiqueta?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm', className)} role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 animate-spin border-2 border-primary border-t-transparent rounded-full"
      />
      <span>{etiqueta}...</span>
    </span>
  );
}
