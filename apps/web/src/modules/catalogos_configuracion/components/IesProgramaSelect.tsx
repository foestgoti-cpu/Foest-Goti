import { useEffect, useId, useState } from 'react';
import { Input } from '../../../components/ui';
import { useBuscarIes, useProgramasDeIes } from '../hooks/useSnies';
import type { IesSnies, ProgramaSnies } from '../types';

/**
 * Selector con busqueda (autocompletado) de institucion y programa del catalogo
 * SNIES. Reutilizable por el formulario GE-F041 (postulaciones): notifica el par
 * seleccionado por `onChange`. Si la IES o el programa no aparecen, el formulario
 * decide si permite registro manual (snies_verificado = false).
 */
export interface SeleccionSnies {
  ies: IesSnies | null;
  programa: ProgramaSnies | null;
}

export function IesProgramaSelect({
  valor,
  onChange,
  deshabilitado = false,
}: {
  valor?: SeleccionSnies;
  onChange: (seleccion: SeleccionSnies) => void;
  deshabilitado?: boolean;
}) {
  const idIes = useId();
  const idPrograma = useId();
  const [qIes, setQIes] = useState('');
  const [qPrograma, setQPrograma] = useState('');
  const [busquedaIes, setBusquedaIes] = useState('');
  const [busquedaPrograma, setBusquedaPrograma] = useState('');
  const ies = valor?.ies ?? null;
  const programa = valor?.programa ?? null;

  useEffect(() => {
    const t = setTimeout(() => setBusquedaIes(qIes), 300);
    return () => clearTimeout(t);
  }, [qIes]);
  useEffect(() => {
    const t = setTimeout(() => setBusquedaPrograma(qPrograma), 300);
    return () => clearTimeout(t);
  }, [qPrograma]);

  const resultadoIes = useBuscarIes(busquedaIes, ies === null);
  const resultadoProgramas = useProgramasDeIes(ies?.codigo_snies ?? null, busquedaPrograma);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={idIes} className="mb-1 block text-sm font-semibold">
          Institucion de educacion superior (SNIES)
        </label>
        {ies ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border border-ink rounded-lg px-3 py-2 text-sm">
            <span>
              <span className="font-mono text-xs">{ies.codigo_snies}</span> · {ies.nombre}
              {ies.municipio ? ` (${ies.municipio})` : ''}
            </span>
            {!deshabilitado && (
              <button type="button" className="text-primary underline" onClick={() => onChange({ ies: null, programa: null })}>
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <>
            <Input id={idIes} placeholder="Nombre o codigo SNIES (minimo 2 caracteres)" value={qIes} onChange={(e) => setQIes(e.target.value)} disabled={deshabilitado} autoComplete="off" />
            {busquedaIes.trim().length >= 2 && (
              <ul className="mt-1 max-h-56 overflow-y-auto border border-ink rounded-lg bg-white text-sm" role="listbox" aria-label="Instituciones encontradas">
                {resultadoIes.isLoading && <li className="px-3 py-2">Buscando...</li>}
                {resultadoIes.data?.data.length === 0 && <li className="px-3 py-2">Sin resultados. Verifique el nombre o el codigo SNIES.</li>}
                {resultadoIes.data?.data.map((i) => (
                  <li key={i.codigo_snies}>
                    <button type="button" className="block w-full px-3 py-2 text-left hover:bg-primary-10" onClick={() => onChange({ ies: i, programa: null })}>
                      <span className="font-mono text-xs">{i.codigo_snies}</span> · {i.nombre}
                      {i.municipio ? <span className="text-ink/70"> ({i.municipio})</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div>
        <label htmlFor={idPrograma} className="mb-1 block text-sm font-semibold">
          Programa academico
        </label>
        {programa ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border border-ink rounded-lg px-3 py-2 text-sm">
            <span>
              <span className="font-mono text-xs">{programa.codigo_snies}</span> · {programa.nombre}
              {programa.nivel ? ` · ${programa.nivel}` : ''}
              {programa.modalidad ? ` · ${programa.modalidad}` : ''}
            </span>
            {!deshabilitado && (
              <button type="button" className="text-primary underline" onClick={() => onChange({ ies, programa: null })}>
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <>
            <Input id={idPrograma} placeholder={ies ? 'Nombre o codigo del programa' : 'Seleccione primero la institucion'} value={qPrograma} onChange={(e) => setQPrograma(e.target.value)} disabled={deshabilitado || ies === null} autoComplete="off" />
            {ies && (
              <ul className="mt-1 max-h-56 overflow-y-auto border border-ink rounded-lg bg-white text-sm" role="listbox" aria-label="Programas encontrados">
                {resultadoProgramas.isLoading && <li className="px-3 py-2">Buscando...</li>}
                {resultadoProgramas.data?.data.length === 0 && <li className="px-3 py-2">Sin programas activos con ese criterio.</li>}
                {resultadoProgramas.data?.data.map((p) => (
                  <li key={p.codigo_snies}>
                    <button type="button" className="block w-full px-3 py-2 text-left hover:bg-primary-10" onClick={() => onChange({ ies, programa: p })}>
                      <span className="font-mono text-xs">{p.codigo_snies}</span> · {p.nombre}
                      {p.nivel ? <span className="text-ink/70"> · {p.nivel}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
