import { useQuery } from '@tanstack/react-query';
import { Alert, Modal, Spinner } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { documentosApi } from '../services/documentosApi';

export interface DocumentViewerModalProps {
  abierto: boolean;
  documentoId: string | null;
  /** Version a consultar; por defecto la vigente. */
  version?: number;
  titulo?: string;
  onCerrar: () => void;
}

/** Previsualizacion de PDF e imagenes con la URL firmada de 300 s (cada entrega queda auditada). */
export function DocumentViewerModal({ abierto, documentoId, version, titulo = 'Vista del soporte', onCerrar }: DocumentViewerModalProps) {
  const consulta = useQuery({
    queryKey: ['documentos', 'url-lectura', documentoId, version ?? 'vigente'],
    queryFn: () => documentosApi.urlLectura(documentoId as string, version),
    enabled: abierto && Boolean(documentoId),
    // La URL vence en 5 minutos y cada entrega se audita: no se reutiliza entre aperturas.
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });

  const mime = consulta.data?.mime_type ?? '';
  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar} textoCancelar="Cerrar">
      {consulta.isLoading && <Spinner etiqueta="Preparando la vista" />}
      {consulta.isError && (
        <Alert tipo="error">
          {consulta.error instanceof ApiRequestError ? consulta.error.message : 'No fue posible obtener el soporte.'}
        </Alert>
      )}
      {consulta.data && (
        <div>
          {mime === 'application/pdf' ? (
            <iframe title={titulo} src={consulta.data.url} className="h-[60vh] w-full border border-ink" />
          ) : (
            <img src={consulta.data.url} alt={consulta.data.nombre_original ?? titulo} className="max-h-[60vh] w-full border border-ink object-contain" />
          )}
          <p className="mt-3 text-sm">
            El enlace es temporal y vence en 5 minutos.{' '}
            <a href={consulta.data.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Abrir en una pestana nueva
            </a>
          </p>
        </div>
      )}
    </Modal>
  );
}
