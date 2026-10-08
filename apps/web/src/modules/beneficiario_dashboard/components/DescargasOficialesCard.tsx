import { useState } from 'react';
import { Alert, Badge, Button, Card, Spinner } from '../../../components/ui';
import { beneficiarioDashboardApi } from '../api';
import type { Descargas } from '../types';

/** Formatos oficiales generados (GE-F041, GE-F043) y certificados de labor social (GE-F038) con su vigencia y enlace de descarga. */
export function DescargasOficialesCard({ datos, cargando, error }: { datos?: Descargas; cargando?: boolean; error?: Error | null }) {
  const [descargando, setDescargando] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  const descargar = async (id: string, rutaApi: string) => {
    setErrorDescarga(null);
    setDescargando(id);
    try {
      const { url } = await beneficiarioDashboardApi.urlDescarga(rutaApi);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setErrorDescarga((e as Error).message || 'No fue posible obtener el enlace de descarga.');
    } finally {
      setDescargando(null);
    }
  };

  return (
    <Card titulo="Descargas de formatos oficiales" data-testid="descargas">
      {cargando && <Spinner etiqueta="Cargando formatos" />}
      {error && <Alert tipo="error">{error.message}</Alert>}
      {errorDescarga && (
        <Alert tipo="error" className="mb-3">
          {errorDescarga}
        </Alert>
      )}
      {datos && datos.pendiente_modulo.formatos && <p className="text-base">La generacion de formatos se habilitara proximamente.</p>}
      {datos && !datos.pendiente_modulo.formatos && datos.descargas.length === 0 && (
        <p className="text-base">Aun no tiene formatos generados. Se generan desde su postulacion antes de enviarla.</p>
      )}
      {datos && datos.descargas.length > 0 && (
        <ul className="divide-y divide-ink/30" aria-label="Formatos oficiales disponibles">
          {datos.descargas.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                  {d.nombre}
                  <Badge tono={d.estado === 'VIGENTE' ? 'relleno' : 'neutro'} aria-label={`Estado del formato: ${d.estado_texto}`}>
                    {d.estado_texto}
                  </Badge>
                </p>
                {d.generado_en && <p className="text-sm text-ink/80">Generado el {new Date(d.generado_en).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>}
              </div>
              <Button
                variante="secundario"
                disabled={d.estado === 'GENERANDO' || d.estado === 'FALLIDO'}
                cargando={descargando === d.id}
                onClick={() => void descargar(d.id, d.url_descarga)}
                aria-label={`Descargar ${d.nombre}`}
              >
                Descargar PDF
              </Button>
            </li>
          ))}
        </ul>
      )}
      {datos && (datos.certificados_labor_social ?? []).length > 0 && (
        <ul className="divide-y divide-ink/30" aria-label="Certificados de labor social disponibles">
          {datos.certificados_labor_social.map((c) => {
            const nombre = `Certificado de labor social (GE-F038) - ${c.semestre}`;
            return (
              <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    {nombre}
                    <Badge tono={c.estado === 'PRESENTADO' ? 'relleno' : 'neutro'}>{c.estado_texto}</Badge>
                  </p>
                  <p className="text-sm text-ink/80">
                    {c.horas} horas - emitido el {new Date(c.emitido_en).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                  </p>
                </div>
                <Button variante="secundario" cargando={descargando === c.id} onClick={() => void descargar(c.id, c.url_descarga)} aria-label={`Descargar ${nombre}`}>
                  Descargar PDF
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
