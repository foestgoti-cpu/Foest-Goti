import { useState } from 'react';
import { Alert, Button } from '../../../components/ui';
import { useDescargarResumen } from '../hooks/useReportes';
import { guardarBlob, mensajeReporte } from '../utils';

/** Descarga el resumen ejecutivo PDF de una postulacion (se genera en la peticion). */
export function DescargarResumenButton({ postulacionId, etiqueta = 'Descargar resumen PDF' }: { postulacionId: string; etiqueta?: string }) {
  const m = useDescargarResumen();
  const [error, setError] = useState<string | null>(null);
  const descargar = async () => {
    setError(null);
    try {
      const { blob, nombre } = await m.mutateAsync(postulacionId);
      guardarBlob(blob, nombre);
    } catch (e) {
      setError(mensajeReporte(e));
    }
  };
  return (
    <span className="inline-flex flex-col gap-2">
      <Button variante="secundario" cargando={m.isPending} onClick={() => void descargar()}>
        {etiqueta}
      </Button>
      {error && <Alert tipo="error">{error}</Alert>}
    </span>
  );
}
