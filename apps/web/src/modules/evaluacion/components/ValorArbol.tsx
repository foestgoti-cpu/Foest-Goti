/** Render recursivo de valores del formulario / perfil (solo lectura). */
export function ValorArbol({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === '') return <>-</>;
  if (typeof v === 'boolean') return <>{v ? 'Si' : 'No'}</>;
  if (Array.isArray(v)) {
    if (v.length === 0) return <>-</>;
    return (
      <ul className="ml-3 list-disc pl-3">
        {v.map((x, i) => (
          <li key={i}>
            <ValorArbol v={x} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof v === 'object') {
    return (
      <dl className="ml-3 border-l border-ink/30 pl-2">
        {Object.entries(v as Record<string, unknown>).map(([k, x]) => (
          <div key={k}>
            <dt className="inline font-semibold">{k.replace(/_/g, ' ')}: </dt>
            <dd className="inline">
              <ValorArbol v={x} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <>{String(v)}</>;
}
