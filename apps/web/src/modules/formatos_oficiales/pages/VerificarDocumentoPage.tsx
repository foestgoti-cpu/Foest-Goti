import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, FormField, Input, PageHeader, Spinner } from '../../../components/ui';
import { useVerificarFormato } from '../hooks/useFormatos';
import { NOMBRE_FORMATO } from '../types';

async function sha256DeArchivo(archivo: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Página pública /verificar/:codigo (el archivo se procesa en el navegador; no se sube). */
export function VerificarDocumentoPage() {
  const { codigo } = useParams<{ codigo?: string }>();
  const navigate = useNavigate();
  const [entrada, setEntrada] = useState(codigo ?? '');
  const { data, isLoading, isError } = useVerificarFormato(codigo);
  const [calculado, setCalculado] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const limpio = entrada.trim();
    if (limpio) navigate(`/verificar/${encodeURIComponent(limpio)}`);
  };

  const onArchivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    setCalculado(null);
    setErrorArchivo(null);
    if (!archivo) return;
    try {
      setCalculado(await sha256DeArchivo(archivo));
    } catch {
      setErrorArchivo('No fue posible calcular la huella del archivo en este navegador.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader titulo="Verificar formato oficial" descripcion="Compruebe que un formato GE-F041 o GE-F043 fue emitido por la plataforma FOEST." />

      <form onSubmit={onSubmit} className="mb-6 space-y-3">
        <FormField etiqueta="Código de verificación" nombre="codigo" ayuda="Está impreso en el pie del documento, junto al código QR.">
          <Input value={entrada} onChange={(e) => setEntrada(e.target.value)} maxLength={64} autoComplete="off" />
        </FormField>
        <Button type="submit" disabled={!entrada.trim()}>
          Verificar
        </Button>
      </form>

      {codigo && isLoading && <Spinner />}
      {codigo && isError && <Alert tipo="error">No fue posible realizar la verificación; intente de nuevo más tarde.</Alert>}

      {data && data.valido && (
        <Card titulo="Documento emitido por la plataforma">
          <dl className="space-y-2 text-base">
            <div>
              <dt className="font-semibold">Formato</dt>
              <dd>{data.tipo ? ((NOMBRE_FORMATO as Record<string, string>)[data.tipo] ?? data.tipo) : ''}</dd>
            </div>
            <div>
              <dt className="font-semibold">Generado el</dt>
              <dd>{data.generado_en ? new Date(data.generado_en).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }) : ''}</dd>
            </div>
            <div>
              <dt className="font-semibold">SHA-256 registrado</dt>
              <dd className="break-all font-mono text-sm">{data.sha256}</dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-ink pt-4">
            <p className="mb-2 text-sm">
              Para comprobar que su copia no fue alterada, seleccione el PDF original descargado de la plataforma. La huella se calcula en su navegador y el archivo no se envía.
            </p>
            <input type="file" accept="application/pdf" onChange={onArchivo} aria-label="Seleccionar PDF para calcular su huella" />
            {errorArchivo && (
              <Alert tipo="error" className="mt-3">
                {errorArchivo}
              </Alert>
            )}
            {calculado && (
              <Alert tipo={calculado === data.sha256 ? 'exito' : 'advertencia'} titulo={calculado === data.sha256 ? 'La huella coincide' : 'La huella no coincide'} className="mt-3">
                <span className="break-all font-mono text-sm">{calculado}</span>
                <span className="mt-1 block text-sm">
                  {calculado === data.sha256
                    ? 'El archivo es idéntico al emitido por la plataforma.'
                    : 'El archivo difiere del emitido. Si es el escaneo firmado a mano, es normal: es un archivo distinto.'}
                </span>
              </Alert>
            )}
          </div>
        </Card>
      )}
      {data && !data.valido && (
        <Alert tipo="advertencia" titulo="Código no encontrado">
          No existe un documento emitido con ese código. Revise que lo haya digitado correctamente.
        </Alert>
      )}

      <Alert tipo="info" className="mt-6">
        Esta verificación solo acredita que la plataforma emitió un archivo con ese código y permite detectar alteraciones. No indica que el formato esté vigente ni firmado, y no constituye firma digital certificada: la validez del compromiso proviene de la firma manuscrita.
      </Alert>
    </div>
  );
}
