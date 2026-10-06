import type { ReactNode } from 'react';

export function EmptyState({ titulo, descripcion, accion }: { titulo: string; descripcion?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="border border-dashed border-ink px-6 py-10 text-center">
      <p className="text-base font-semibold">{titulo}</p>
      {descripcion && <p className="mt-2 text-sm text-ink/80">{descripcion}</p>}
      {accion && <div className="mt-4 flex justify-center">{accion}</div>}
    </div>
  );
}
