import { Alert, Badge, Card, Spinner, type TonoBadge } from '../../../components/ui';
import type { Documentos, EstadoDocumento } from '../types';

const TONO: Record<EstadoDocumento, TonoBadge> = {
  APROBADO: 'relleno',
  POR_CORREGIR: 'destacado',
  PENDIENTE: 'neutro',
  NO_APLICA: 'neutro',
  PROCESANDO: 'neutro',
  ARCHIVO_RECHAZADO: 'destacado',
  SIN_CARGAR: 'neutro',
};

/** Checklist de soportes con insignias derivadas del chequeo del ultimo ciclo. */
export function DocumentChecklistStatus({ datos, cargando, error }: { datos?: Documentos; cargando?: boolean; error?: Error | null }) {
  return (
    <Card titulo="Estado de sus documentos" data-testid="checklist-documentos">
      {cargando && <Spinner etiqueta="Cargando documentos" />}
      {error && <Alert tipo="error">{error.message}</Alert>}
      {!cargando && !error && !datos && <p className="text-base">Cuando tenga una postulacion, aqui vera el estado de cada soporte.</p>}
      {datos && datos.pendiente_modulo.documentos && (
        <p className="text-base">La carga de documentos se habilitara proximamente. Por ahora no hay soportes para mostrar.</p>
      )}
      {datos && !datos.pendiente_modulo.documentos && datos.documentos.length === 0 && <p className="text-base">Aun no ha cargado soportes en esta postulacion.</p>}
      {datos && datos.documentos.length > 0 && (
        <ul className="divide-y divide-ink/30" aria-label="Documentos de la postulacion">
          {datos.documentos.map((d) => (
            <li key={d.tipo_id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-base font-semibold">
                  {d.tipo_nombre}
                  {d.obligatorio && <span className="ml-2 text-xs uppercase tracking-wide text-ink/80">(obligatorio)</span>}
                </p>
                {d.observacion && (
                  <p className="mt-1 text-sm">
                    <span className="font-semibold">Observacion ({d.observacion.firma}):</span> {d.observacion.texto}
                  </p>
                )}
              </div>
              <Badge tono={TONO[d.estado]} aria-label={`Estado del documento: ${d.estado_texto}`}>
                {d.estado_texto}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
