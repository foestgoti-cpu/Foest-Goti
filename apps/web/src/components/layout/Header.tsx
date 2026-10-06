import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export const TEXTO_INSTITUCIONAL = 'Alcaldia de Tocancipa - Fondo para la Educacion Superior (FOEST)';

/** Encabezado institucional con franja azul. */
export function Header({ derecha }: { derecha?: ReactNode }) {
  return (
    <header className="border-b border-ink bg-white">
      <div className="h-2 w-full bg-primary" aria-hidden="true" />
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-gutter py-3">
        <Link to="/" className="no-underline hover:no-underline">
          <span className="block text-xs uppercase tracking-widest text-ink/70">Republica de Colombia</span>
          <span className="block text-base font-semibold text-ink">{TEXTO_INSTITUCIONAL}</span>
        </Link>
        {derecha && <div className="flex items-center gap-3 text-sm">{derecha}</div>}
      </div>
    </header>
  );
}
