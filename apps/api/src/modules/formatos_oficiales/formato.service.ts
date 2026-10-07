import { TipoFormato, EstadoFormato } from '@foest/shared';
import { hashContenidoService } from './hash-contenido';
import crypto from 'node:crypto';
// import { renderService } from './render.service';

export class FormatoService {
  async generar(postulacionId: string, tipo: TipoFormato) {
    // 1. Get current data for postulacion
    const datos = {}; // mock

    // 2. Calculate hash
    const hashContenido = hashContenidoService.calcularHash(tipo, datos);

    // 3. Check if existing
    // if existing is vigente and hash matches -> return it

    // 4. Generate verification code
    const codigoVerificacion = crypto.randomBytes(16).toString('base64url');

    // 5. Enqueue or render sync
    // if sync:
    // const pdf = await renderService.render(tipo, datos, codigoVerificacion);
    // save to S3
    // save to DB
    
    return {
      formato_id: crypto.randomUUID(),
      codigo_verificacion: codigoVerificacion,
      hash_contenido: hashContenido,
      estado: EstadoFormato.GENERANDO
    };
  }

  async getUrlDescarga(formatoId: string) {
    // same logic with presigned URL
    return { url: 'https://...', expira_en: new Date().toISOString() };
  }
}

export const formatoService = new FormatoService();

