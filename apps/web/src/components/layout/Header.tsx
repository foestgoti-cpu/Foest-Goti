import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export const TEXTO_INSTITUCIONAL = 'Alcaldía de Tocancipá — Fondo para la Educación Superior (FOEST)';

/** Encabezado institucional: franja azul, logo del municipio (SVG) y zona derecha opcional. */
export function Header({ derecha }: { derecha?: ReactNode }) {
  return (
    <header className="relative z-10 bg-white shadow-md">
      <div className="h-2 w-full bg-primary" aria-hidden="true" />
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-gutter py-3">
        <Link to="/" className="inline-flex rounded-lg no-underline hover:no-underline">
          <img
            src="/logo-municipio.svg"
            alt={TEXTO_INSTITUCIONAL}
            width={169}
            height={48}
            decoding="async"
            className="h-10 w-auto sm:h-12"
          />
        </Link>
        {derecha && <div className="flex items-center gap-3 text-sm">{derecha}</div>}
      </div>
    </header>
  );
}
