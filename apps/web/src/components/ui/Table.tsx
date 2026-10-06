import type { ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Spinner } from './Spinner';

/**
 * Tabla paginada generica. Recibe el contrato de paginacion estandar
 * `{ data, page, page_size, total }` y notifica cambios de pagina.
 */
export interface Columna<T> {
  clave: string;
  titulo: ReactNode;
  render: (fila: T) => ReactNode;
  className?: string;
  alineacion?: 'izquierda' | 'derecha' | 'centro';
}

export interface TableProps<T> {
  columnas: Columna<T>[];
  filas: T[];
  obtenerId: (fila: T) => string;
  cargando?: boolean;
  vacio?: { titulo: string; descripcion?: ReactNode };
  paginacion?: { page: number; page_size: number; total: number; onCambiarPagina: (page: number) => void };
  caption?: string;
}

const alineaciones = { izquierda: 'text-left', derecha: 'text-right', centro: 'text-center' } as const;

export function Table<T>({ columnas, filas, obtenerId, cargando, vacio, paginacion, caption }: TableProps<T>) {
  const totalPaginas = paginacion ? Math.max(1, Math.ceil(paginacion.total / paginacion.page_size)) : 1;

  return (
    <div className="border border-ink bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-primary-10">
            <tr>
              {columnas.map((c) => (
                <th key={c.clave} scope="col" className={`border-b border-ink px-3 py-2 font-semibold ${alineaciones[c.alineacion ?? 'izquierda']} ${c.className ?? ''}`}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={columnas.length} className="px-3 py-6 text-center">
                  <Spinner />
                </td>
              </tr>
            )}
            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={columnas.length} className="p-3">
                  <EmptyState titulo={vacio?.titulo ?? 'Sin registros'} descripcion={vacio?.descripcion} />
                </td>
              </tr>
            )}
            {!cargando &&
              filas.map((fila) => (
                <tr key={obtenerId(fila)} className="border-b border-ink/30 last:border-b-0 hover:bg-primary-10">
                  {columnas.map((c) => (
                    <td key={c.clave} className={`px-3 py-2 align-top ${alineaciones[c.alineacion ?? 'izquierda']} ${c.className ?? ''}`}>
                      {c.render(fila)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {paginacion && (
        <nav aria-label="Paginacion" className="flex flex-wrap items-center justify-between gap-2 border-t border-ink px-3 py-2 text-sm">
          <span>
            Pagina {paginacion.page} de {totalPaginas} ({paginacion.total} registros)
          </span>
          <div className="flex gap-2">
            <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" disabled={paginacion.page <= 1} onClick={() => paginacion.onCambiarPagina(paginacion.page - 1)}>
              Anterior
            </Button>
            <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" disabled={paginacion.page >= totalPaginas} onClick={() => paginacion.onCambiarPagina(paginacion.page + 1)}>
              Siguiente
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
