import { TITULOS_SECCION } from '@foest/shared';
import { Card } from '../../../components/ui';
import type { Validacion } from '../types';

/** Panel de validacion previa: secciones, campos faltantes, declaraciones, documentos y formatos. */
export function ChecklistValidacion({ validacion, onIrSeccion }: { validacion: Validacion; onIrSeccion?: (s: Validacion['secciones_aplicables'][number]) => void }) {
  const porSeccion = new Map<string, Validacion['campos_faltantes']>();
  for (const c of validacion.campos_faltantes) {
    const lista = porSeccion.get(c.seccion) ?? [];
    lista.push(c);
    porSeccion.set(c.seccion, lista);
  }

  return (
    <Card titulo="Lista de verificacion del expediente">
      <p className="mb-3 text-sm">
        {validacion.completo
          ? 'Su expediente esta completo y puede enviarse.'
          : 'Su expediente tiene pendientes. Complete los elementos marcados antes de enviar.'}
      </p>
      <ul className="divide-y divide-ink/30 border border-ink">
        {validacion.secciones_aplicables.map((s) => {
          const completa = validacion.secciones_completas.includes(s);
          const faltantes = porSeccion.get(s) ?? [];
          return (
            <li key={s} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={completa ? 'font-semibold' : ''}>
                  {TITULOS_SECCION[s]}: {completa ? 'Completa' : 'Pendiente'}
                </span>
                {!completa && onIrSeccion && s !== 'seccion_1' && (
                  <button type="button" className="min-h-[36px] text-primary underline" onClick={() => onIrSeccion(s)}>
                    Ir a la seccion
                  </button>
                )}
              </div>
              {faltantes.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-ink/80">
                  {faltantes.slice(0, 8).map((f) => (
                    <li key={`${f.seccion}-${f.campo}`}>
                      {f.campo}: {f.mensaje}
                    </li>
                  ))}
                  {faltantes.length > 8 && <li>y {faltantes.length - 8} mas</li>}
                </ul>
              )}
              {s === 'seccion_1' && !validacion.perfil_completo && <p className="mt-1 text-ink/80">Debe completar su perfil en Mi perfil.</p>}
            </li>
          );
        })}
        <li className="px-3 py-2 text-sm">
          Documentos de soporte:{' '}
          {validacion.documentos.pendiente_modulo
            ? 'la carga de documentos se habilitara en una proxima entrega.'
            : validacion.documentos.faltantes.length === 0
              ? 'Completos'
              : `${validacion.documentos.faltantes.length} pendientes`}
        </li>
        <li className="px-3 py-2 text-sm">Formatos oficiales (GE-F041 y GE-F043): la generacion se habilitara en una proxima entrega.</li>
      </ul>
    </Card>
  );
}
