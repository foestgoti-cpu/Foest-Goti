import { Alert, Checkbox } from '../../../components/ui';
import type { DeclaracionVigente } from '../types';

/** Seccion 9: las 6 declaraciones juramentadas con texto completo y aceptacion individual. */
export function DeclaracionesPaso({
  declaraciones,
  aceptadas,
  onCambiar,
  deshabilitado,
}: {
  declaraciones: DeclaracionVigente[];
  aceptadas: string[];
  onCambiar: (codigo: string, valor: boolean) => void;
  deshabilitado?: boolean;
}) {
  if (declaraciones.length === 0) {
    return <Alert tipo="advertencia">El catalogo de declaraciones juramentadas no esta configurado. Comuniquese con el FOEST.</Alert>;
  }
  const provisional = declaraciones.some((d) => !d.texto_oficial_confirmado);
  return (
    <div>
      <p className="mb-3 text-sm">
        Lea cada declaracion completa y marque la casilla para aceptarla bajo la gravedad de juramento. Las seis declaraciones son obligatorias.
      </p>
      {provisional && (
        <Alert tipo="info" className="mb-3">
          El texto de las declaraciones es provisional hasta que el FOEST cargue el texto oficial del formato GE-F041.
        </Alert>
      )}
      <ol className="space-y-3">
        {declaraciones.map((d, i) => (
          <li key={d.codigo} className="border border-ink rounded-lg p-3">
            <h3 className="text-base font-semibold">
              {i + 1}. {d.titulo}
            </h3>
            <p className="mt-1 whitespace-pre-line text-sm">{d.texto}</p>
            <div className="mt-2">
              <Checkbox
                etiqueta={`Acepto la declaracion ${i + 1} (version ${d.version})`}
                checked={aceptadas.includes(d.codigo)}
                disabled={deshabilitado}
                onChange={(e) => onCambiar(d.codigo, e.target.checked)}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
