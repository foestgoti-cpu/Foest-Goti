import { Badge } from '../../../components/ui';
import { ETIQUETA_ALCANCE, ETIQUETA_ROL, tituloCategoria, type MatrizPermisos } from '../types';

/**
 * Vista de solo lectura de la matriz rol x permiso agrupada por categoria.
 * Cada celda indica con texto ("Si" / "No") si el rol tiene el permiso; la
 * columna de alcance muestra sobre que recursos aplica. Sin colores semanticos.
 */
export function PermisosMatrixView({ matriz }: { matriz: MatrizPermisos }) {
  const categorias = matriz.categorias.length > 0 ? matriz.categorias : [...new Set(matriz.filas.map((f) => f.categoria))];

  return (
    <div className="space-y-6">
      {categorias.map((categoria) => {
        const filas = matriz.filas.filter((f) => f.categoria === categoria);
        if (filas.length === 0) return null;
        return (
          <section key={categoria} aria-labelledby={`cat-${categoria}`} className="border border-ink bg-white">
            <h2 id={`cat-${categoria}`} className="border-b border-ink bg-primary-10 px-3 py-2 text-base font-semibold">
              {tituloCategoria(categoria)}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Permisos de la categoria {tituloCategoria(categoria)}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-ink px-3 py-2 font-semibold">
                      Permiso
                    </th>
                    {matriz.roles.map((r) => (
                      <th key={r.id} scope="col" className="border-b border-ink px-3 py-2 text-center font-semibold">
                        {ETIQUETA_ROL[r.nombre]}
                      </th>
                    ))}
                    <th scope="col" className="border-b border-ink px-3 py-2 font-semibold">
                      Alcance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => (
                    <tr key={fila.codigo} className="border-b border-ink/30 last:border-b-0 hover:bg-primary-10">
                      <th scope="row" className="px-3 py-2 align-top font-normal">
                        <code className="font-mono text-sm">{fila.codigo}</code>
                        {fila.descripcion && <p className="mt-0.5 text-xs text-ink/80">{fila.descripcion}</p>}
                      </th>
                      {matriz.roles.map((r) => {
                        const tiene = fila.roles[r.nombre];
                        return (
                          <td key={r.id} className="px-3 py-2 text-center align-top">
                            <span
                              aria-label={`${ETIQUETA_ROL[r.nombre]}: ${tiene ? 'concedido' : 'no concedido'}`}
                              className={tiene ? 'inline-block border border-primary bg-primary-20 px-2 py-0.5 font-semibold' : 'inline-block px-2 py-0.5 text-ink/60'}
                            >
                              {tiene ? 'Si' : 'No'}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 align-top">
                        <Badge tono="destacado">{ETIQUETA_ALCANCE[fila.alcance]}</Badge>
                        {fila.regla_alcance && <p className="mt-1 text-xs text-ink/80">{fila.regla_alcance}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
