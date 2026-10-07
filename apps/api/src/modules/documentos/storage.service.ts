import { AppError, supabaseAdmin } from '../../shared';

/**
 * Acceso a Supabase Storage (bucket privado `documentos`). Solo service_role.
 * Subida: `createSignedUploadUrl` (el cliente hace PUT directo); lectura: `createSignedUrl(path, 300)`.
 * Las claves son anonimas: `postulaciones/{postulacion_id}/{documento_id}/v{version}.bin`.
 */
export const BUCKET_DOCUMENTOS = 'documentos';

export function claveObjeto(postulacionId: string, documentoId: string, version: number): string {
  return `postulaciones/${postulacionId}/${documentoId}/v${version}.bin`;
}

function bucket() {
  return supabaseAdmin.storage.from(BUCKET_DOCUMENTOS);
}

export const storageDocumentos = {
  /** URL de subida directa (PUT multipart) valida unas 2 horas. */
  async crearUrlSubida(key: string): Promise<{ url: string; token: string }> {
    const { data, error } = await bucket().createSignedUploadUrl(key);
    if (error || !data) throw AppError.interno(`No fue posible reservar la subida: ${error?.message ?? 'sin respuesta'}`);
    return { url: data.signedUrl, token: data.token };
  },

  /** Tamano real del objeto o `null` si no existe. */
  async tamano(key: string): Promise<number | null> {
    const idx = key.lastIndexOf('/');
    const carpeta = key.slice(0, idx);
    const nombre = key.slice(idx + 1);
    const { data, error } = await bucket().list(carpeta, { limit: 100, search: nombre });
    if (error) throw AppError.interno(`No fue posible consultar el objeto: ${error.message}`);
    const objeto = (data ?? []).find((o) => o.name === nombre);
    if (!objeto) return null;
    const size = (objeto.metadata as { size?: unknown } | null)?.size;
    return typeof size === 'number' ? size : Number(size ?? 0);
  },

  async descargar(key: string): Promise<Buffer> {
    const { data, error } = await bucket().download(key);
    if (error || !data) throw AppError.interno(`No fue posible leer el objeto: ${error?.message ?? 'sin respuesta'}`);
    return Buffer.from(await data.arrayBuffer());
  },

  /** Elimina objetos; los inexistentes no son error. */
  async eliminar(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const { error } = await bucket().remove(keys);
    if (error) throw AppError.interno(`No fue posible eliminar objetos: ${error.message}`);
  },

  async urlLectura(key: string, segundos: number): Promise<string> {
    const { data, error } = await bucket().createSignedUrl(key, segundos);
    if (error || !data) throw AppError.interno(`No fue posible firmar la URL de lectura: ${error?.message ?? 'sin respuesta'}`);
    return data.signedUrl;
  },
};
