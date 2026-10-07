import { useCallback, useRef, useState } from 'react';
import { MIMES_DOCUMENTO_PERMITIDOS, type MimeDocumento, type TipoDocumento } from '@foest/shared';
import { ApiRequestError } from '../../../lib/api';
import { documentosApi } from '../services/documentosApi';
import type { FaseCarga, UploadUrlRespuestaDto } from '../types';

const MB = 1024 * 1024;
const INTERVALO_SONDEO_MS = 1500;
const MAX_SONDEOS = 40;

export interface OpcionesCarga {
  postulacionId: string;
  tipo: TipoDocumento;
  maxMb: number;
  formatoGeneradoId?: string;
  motivoReemplazo?: string;
}

/** Validacion local de tipo y tamano (la definitiva la hace el servidor). Devuelve el mensaje o `null`. */
export function validarArchivoLocal(file: File, maxMb: number): string | null {
  if (!(MIMES_DOCUMENTO_PERMITIDOS as readonly string[]).includes(file.type)) {
    return 'Solo se admiten archivos PDF, JPEG o PNG.';
  }
  if (file.size <= 0) return 'El archivo esta vacio.';
  if (file.size > maxMb * MB) return `El archivo supera el maximo permitido de ${maxMb} MB.`;
  return null;
}

/** PUT multipart directo a Supabase Storage con progreso real (XMLHttpRequest). */
export function subirArchivoDirecto(upload: UploadUrlRespuestaDto['upload'], file: File, onProgreso: (porcentaje: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
    form.append(upload.campo_archivo, file);

    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    for (const [k, v] of Object.entries(upload.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`La subida fue rechazada por el almacenamiento (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('No fue posible comunicarse con el almacenamiento. Verifique su conexion e intente de nuevo.'));
    xhr.onabort = () => reject(new Error('La subida fue cancelada.'));
    xhr.send(form);
  });
}

function mensajeDe(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error) return e.message;
  return 'No fue posible cargar el archivo.';
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Orquesta el flujo completo: `upload-url` -> subida directa con progreso -> `confirmar`
 * -> sondeo del estado de escaneo hasta DISPONIBLE o RECHAZADO_ARCHIVO.
 */
export function useDocumentUpload() {
  const [fase, setFase] = useState<FaseCarga>('inactivo');
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const activo = useRef(false);

  const reiniciar = useCallback(() => {
    setFase('inactivo');
    setProgreso(0);
    setError(null);
  }, []);

  const subir = useCallback(async (file: File, op: OpcionesCarga): Promise<boolean> => {
    if (activo.current) return false;
    const invalido = validarArchivoLocal(file, op.maxMb);
    if (invalido) {
      setFase('error');
      setError(invalido);
      return false;
    }
    activo.current = true;
    setError(null);
    setProgreso(0);
    try {
      setFase('reservando');
      const reserva = await documentosApi.solicitarSubida(op.postulacionId, {
        tipo_codigo: op.tipo,
        mime: file.type as MimeDocumento,
        tamano_bytes: file.size,
        nombre_original: file.name.slice(0, 255),
        formato_generado_id: op.formatoGeneradoId,
        motivo_reemplazo: op.motivoReemplazo,
      });

      setFase('subiendo');
      await subirArchivoDirecto(reserva.upload, file, setProgreso);
      setProgreso(100);

      setFase('confirmando');
      const confirmado = await documentosApi.confirmar(reserva.documento_id, { version: reserva.version });

      setFase('verificando');
      let estado = confirmado.estado_carga;
      let intentos = 0;
      while (estado === 'ESCANEANDO' && intentos < MAX_SONDEOS) {
        await esperar(INTERVALO_SONDEO_MS);
        const doc = await documentosApi.obtener(reserva.documento_id);
        const version = doc.versiones.find((v) => v.version === reserva.version);
        estado = version?.estado_carga ?? 'ESCANEANDO';
        if (estado === 'RECHAZADO_ARCHIVO') {
          setFase('error');
          setError(version?.motivo_rechazo_archivo ?? 'El archivo fue rechazado.');
          return false;
        }
        intentos += 1;
      }
      if (estado === 'DISPONIBLE') {
        setFase('listo');
        return true;
      }
      // Escaneo aun pendiente (p. ej. antivirus ocupado): el soporte quedara disponible al terminar.
      setFase('listo');
      return true;
    } catch (e) {
      setFase('error');
      setError(mensajeDe(e));
      return false;
    } finally {
      activo.current = false;
    }
  }, []);

  return { fase, progreso, error, ocupado: fase === 'reservando' || fase === 'subiendo' || fase === 'confirmando' || fase === 'verificando', subir, reiniciar };
}
