import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Spinner } from '../../../components/ui';
import { evaluacionApi } from '../api';

/** Visor propio: solicita la URL firmada (300 s) al abrir y la muestra en iframe o imagen. */
export function VisorDocumentoModal({
  documentoId,
  titulo,
  mime,
  onCerrar,
}: {
  documentoId: string | null;
  titulo: string;
  mime?: string | null;
  onCerrar: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!documentoId) return;
    let activo = true;
    setUrl(null);
    setError(null);
    evaluacionApi
      .urlDocumento(documentoId)
      .then((r) => {
        if (activo) setUrl(r.url);
      })
      .catch((e: unknown) => {
        if (activo) setError((e as Error).message || 'No fue posible obtener el documento.');
      });
    return () => {
      activo = false;
    };
  }, [documentoId, intento]);

  const esImagen = Boolean(mime && mime.startsWith('image/'));

  return (
    <Modal abierto={documentoId !== null} titulo={titulo} onCerrar={onCerrar}>
      {error && (
        <Alert tipo="error">
          {error}{' '}
          <Button variante="texto" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </Button>
        </Alert>
      )}
      {!error && !url && <Spinner />}
      {url && (
        <div>
          <p className="mb-2 text-sm">El enlace es temporal (5 minutos). Si expira, cierre y vuelva a abrir el documento.</p>
          {esImagen ? (
            <img src={url} alt={titulo} className="max-h-[60vh] w-full border border-ink rounded-lg overflow-hidden object-contain" />
          ) : (
            <iframe src={url} title={titulo} className="h-[60vh] w-full border border-ink rounded-lg overflow-hidden" />
          )}
        </div>
      )}
    </Modal>
  );
}
