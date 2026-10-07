import { Badge, Button, Card, Select, Textarea } from '../../../components/ui';
import { RESULTADOS_DOCUMENTO, type ChequeoItemDto, type DocumentoExpedienteDto, type ResultadoDocumento } from '../types';

const TEXTO_RESULTADO: Record<ResultadoDocumento, string> = {
  PRESENTA: 'Presenta',
  NO_PRESENTA: 'No presenta',
  NO_APLICA: 'No aplica',
};

const TEXTO_CARGA: Record<string, string> = {
  SUBIENDO: 'Subiendo',
  ESCANEANDO: 'En analisis',
  DISPONIBLE: 'Disponible',
  RECHAZADO_ARCHIVO: 'Archivo rechazado',
};

export type MapaChequeo = Record<string, { resultado: ResultadoDocumento | ''; observacion: string }>;

export function mapaDesdeChequeo(items: ChequeoItemDto[]): MapaChequeo {
  const m: MapaChequeo = {};
  for (const i of items) m[i.tipo_codigo] = { resultado: i.resultado, observacion: i.observacion ?? '' };
  return m;
}

/** Matriz de chequeo por TIPO de documento (columna derecha). */
export function TablaChequeoDocumental({
  documentos,
  valores,
  onCambiar,
  onVer,
  onGuardar,
  guardando,
  sucio,
  soloLectura,
}: {
  documentos: DocumentoExpedienteDto[];
  valores: MapaChequeo;
  onCambiar: (tipoCodigo: string, cambio: Partial<{ resultado: ResultadoDocumento | ''; observacion: string }>) => void;
  onVer: (d: DocumentoExpedienteDto) => void;
  onGuardar: () => void;
  guardando: boolean;
  sucio: boolean;
  soloLectura: boolean;
}) {
  return (
    <Card
      titulo="Chequeo de documentos - Uso exclusivo FOEST"
      acciones={
        !soloLectura && (
          <Button onClick={onGuardar} cargando={guardando} disabled={!sucio}>
            Guardar chequeo
          </Button>
        )
      }
    >
      {documentos.length === 0 && <p className="text-sm">No hay documentos exigibles para los beneficios solicitados.</p>}
      <ul className="space-y-3">
        {documentos.map((d) => {
          const v = valores[d.tipo_codigo] ?? { resultado: '', observacion: '' };
          const cargado = d.documento !== null;
          const disponible = d.documento?.estado_carga === 'DISPONIBLE';
          return (
            <li key={d.tipo_codigo} className="border border-ink p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {d.tipo_nombre} {d.obligatorio && <span className="text-sm font-normal">(obligatorio)</span>}
                  </p>
                  <p className="text-sm">
                    <Badge tono={disponible ? 'destacado' : 'neutro'}>
                      {cargado ? (TEXTO_CARGA[d.documento?.estado_carga ?? ''] ?? d.documento?.estado_carga ?? 'Cargado') : 'No cargado'}
                    </Badge>
                  </p>
                </div>
                {cargado && (
                  <Button variante="secundario" onClick={() => onVer(d)} aria-label={`Ver documento ${d.tipo_nombre}`}>
                    Ver documento
                  </Button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Select
                  aria-label={`Resultado de ${d.tipo_nombre}`}
                  value={v.resultado}
                  disabled={soloLectura}
                  placeholder="Sin calificar"
                  onChange={(e) => onCambiar(d.tipo_codigo, { resultado: e.target.value as ResultadoDocumento | '' })}
                  opciones={RESULTADOS_DOCUMENTO.map((r) => ({
                    valor: r,
                    etiqueta: TEXTO_RESULTADO[r],
                    deshabilitada: r === 'PRESENTA' && !disponible,
                  }))}
                />
                <Textarea
                  className="sm:col-span-2"
                  rows={2}
                  aria-label={`Observacion de ${d.tipo_nombre}`}
                  placeholder="Observacion (opcional)"
                  value={v.observacion}
                  disabled={soloLectura}
                  onChange={(e) => onCambiar(d.tipo_codigo, { observacion: e.target.value })}
                />
              </div>
              {!disponible && !soloLectura && <p className="mt-1 text-sm">Solo puede marcarse como presentado un soporte disponible.</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
