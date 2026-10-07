import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Spinner } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { useDescargarFormato, useFormatos, useGenerarFormato } from '../hooks/useFormatos';
import { DESCRIPCION_FORMATO, EstadoVigenciaFormato, NOMBRE_FORMATO, SOPORTE_FORMATO, type TipoFormato } from '../types';
import { FormatoEstadoBadge } from './FormatoEstadoBadge';

function mensajeDe(e: unknown): string {
  if (e instanceof ApiRequestError) {
    const faltantes = (e.details as { campos_faltantes?: Array<{ seccion_titulo: string; campo: string }> } | undefined)?.campos_faltantes;
    return `${e.message}${faltantes?.length ? `: ${faltantes.slice(0, 4).map((f) => `${f.seccion_titulo} - ${f.campo}`).join('; ')}` : ''}`;
  }
  return 'No fue posible completar la operación.';
}

/**
 * Tarjeta de formatos oficiales GE-F041 y GE-F043: estado de cada uno, generar y descargar.
 * Flujo híbrido: se descarga, se firma a mano, se escanea y se sube como soporte.
 */
export function DescargarFormulariosCard({ postulacionId, enlaceDetalle = false }: { postulacionId: string; enlaceDetalle?: boolean }) {
  const { data, isLoading, error } = useFormatos(postulacionId);
  const generar = useGenerarFormato(postulacionId);
  const descargar = useDescargarFormato();
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);

  const onGenerar = (tipo: TipoFormato) => {
    setMensaje(null);
    generar.mutate(tipo, {
      onSuccess: (f) =>
        setMensaje({ tipo: 'exito', texto: f.estado === 'GENERANDO' ? 'El formato se está generando; esta página se actualizará al terminar.' : 'El formato está listo para descargar.' }),
      onError: (e) => setMensaje({ tipo: 'error', texto: mensajeDe(e) }),
    });
  };
  const onDescargar = (id: string) => {
    setMensaje(null);
    descargar.mutate(id, { onError: (e) => setMensaje({ tipo: 'error', texto: mensajeDe(e) }) });
  };

  return (
    <Card titulo="Formatos oficiales" acciones={enlaceDetalle ? <Link to={`/beneficiario/postulaciones/${postulacionId}/formatos`}>Ver instrucciones</Link> : undefined}>
      <Alert tipo="advertencia" titulo="Firma manuscrita obligatoria" className="mb-4">
        El código de verificación y el código QR impresos solo permiten comprobar que la plataforma emitió el archivo y detectar alteraciones. No son una firma digital certificada ni reemplazan su firma. Descargue el formato, imprímalo, fírmelo a mano, escanéelo y súbalo como soporte (FORM_INS para el GE-F041 y PAG_CART para el GE-F043).
      </Alert>

      {isLoading && <Spinner />}
      {error && <Alert tipo="error">{mensajeDe(error)}</Alert>}
      {mensaje && (
        <Alert tipo={mensaje.tipo === 'error' ? 'error' : 'exito'} className="mb-4">
          {mensaje.texto}
        </Alert>
      )}

      {data && (
        <>
          {!data.puede_generar && data.motivo_bloqueo && <p className="mb-3 text-sm">{data.motivo_bloqueo}.</p>}
          <ul className="divide-y divide-ink border border-ink">
            {data.formatos.map((r) => {
              const generando = r.formato?.estado === 'GENERANDO' || (generar.isPending && generar.variables === r.tipo);
              const vigente = r.situacion !== EstadoVigenciaFormato.NO_GENERADO ? r.formato : null;
              return (
                <li key={r.tipo} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="max-w-xl">
                    <p className="font-semibold">{NOMBRE_FORMATO[r.tipo]}</p>
                    <p className="text-sm">{DESCRIPCION_FORMATO[r.tipo]}</p>
                    <p className="mt-1 text-sm">
                      <FormatoEstadoBadge resumen={r} /> <span className="ml-2">Soporte: {SOPORTE_FORMATO[r.tipo]}</span>
                    </p>
                    {vigente && (
                      <p className="mt-1 text-xs">
                        Código de verificación: <span className="font-mono">{vigente.codigo_verificacion}</span>
                      </p>
                    )}
                    {r.situacion === EstadoVigenciaFormato.DESACTUALIZADO && (
                      <p className="mt-1 text-sm">Sus datos cambiaron después de generar este formato. Regenere, firme de nuevo y vuelva a cargar el soporte.</p>
                    )}
                    {r.formato?.estado === 'FALLIDO' && <p className="mt-1 text-sm">La última generación falló; puede intentarlo de nuevo.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {vigente && (
                      <Button variante="secundario" onClick={() => onDescargar(vigente.id)} cargando={descargar.isPending && descargar.variables === vigente.id}>
                        Descargar
                      </Button>
                    )}
                    {data.puede_generar && r.situacion !== EstadoVigenciaFormato.VIGENTE && (
                      <Button onClick={() => onGenerar(r.tipo)} disabled={generando} cargando={generando}>
                        {r.situacion === EstadoVigenciaFormato.DESACTUALIZADO ? 'Regenerar' : 'Generar'}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
