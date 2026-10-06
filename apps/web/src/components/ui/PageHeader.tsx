import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Miga {
  etiqueta: string;
  ruta?: string;
}

export function PageHeader({
  titulo,
  descripcion,
  acciones,
  migas,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  migas?: Miga[];
}) {
  return (
    <div className="mb-6 border-b border-ink pb-4">
      {migas && migas.length > 0 && (
        <nav aria-label="Ruta de navegacion" className="mb-2 text-sm">
          <ol className="flex flex-wrap items-center gap-1">
            {migas.map((m, i) => (
              <li key={`${m.etiqueta}-${i}`} className="flex items-center gap-1">
                {m.ruta ? <Link to={m.ruta}>{m.etiqueta}</Link> : <span aria-current="page">{m.etiqueta}</span>}
                {i < migas.length - 1 && <span aria-hidden="true">/</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{titulo}</h1>
          {descripcion && <p className="mt-1 max-w-3xl text-base text-ink/80">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
    </div>
  );
}
