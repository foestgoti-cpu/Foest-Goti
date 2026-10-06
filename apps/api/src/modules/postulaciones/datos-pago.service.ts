import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../../shared';

/**
 * Cifrado a nivel de campo de los datos de pago del subsidio de transporte
 * (DECISIONES.md seccion 12): AES-256-GCM en Node con clave por entorno.
 *
 * Decision: se cifra en la API (no con pgcrypto) para que la clave nunca viva en
 * la base de datos ni viaje en el SQL; Supabase solo almacena el texto cifrado.
 *
 * Variable de entorno `DATOS_PAGO_KEY`: 32 bytes en hexadecimal (64 caracteres)
 * o en base64 (44 caracteres). Generar con:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * `DATOS_PAGO_KEY_VERSION` (opcional, por defecto `v1`) se guarda en
 * `datos_pago_st.clave_version` para permitir rotacion.
 *
 * Formato almacenado: `<version>:<iv_b64>:<tag_b64>:<cifrado_b64>`.
 */
export const CLAVE_VERSION_ACTUAL = process.env.DATOS_PAGO_KEY_VERSION?.trim() || 'v1';

function cargarClave(): Buffer {
  const crudo = process.env.DATOS_PAGO_KEY?.trim();
  if (!crudo) {
    throw new AppError(
      503,
      'CIFRADO_NO_CONFIGURADO',
      'La API no tiene configurada DATOS_PAGO_KEY; no es posible guardar datos de pago',
    );
  }
  let clave: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(crudo)) clave = Buffer.from(crudo, 'hex');
  else clave = Buffer.from(crudo, 'base64');
  if (clave.length !== 32) {
    throw new AppError(503, 'CIFRADO_NO_CONFIGURADO', 'DATOS_PAGO_KEY debe ser de 32 bytes (hex de 64 caracteres o base64)');
  }
  return clave;
}

export function cifrarNumero(numero: string): { numero_cifrado: string; ultimos4: string; clave_version: string } {
  const clave = cargarClave();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', clave, iv);
  const cifrado = Buffer.concat([cipher.update(numero, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    numero_cifrado: `${CLAVE_VERSION_ACTUAL}:${iv.toString('base64')}:${tag.toString('base64')}:${cifrado.toString('base64')}`,
    ultimos4: numero.slice(-4),
    clave_version: CLAVE_VERSION_ACTUAL,
  };
}

/**
 * Descifrado. SOLO debe invocarse desde `seguimiento_beneficios` (desembolsos) con
 * auditoria; `postulaciones` nunca devuelve el numero en claro.
 */
export function descifrarNumero(almacenado: string): string {
  const clave = cargarClave();
  const partes = almacenado.split(':');
  if (partes.length !== 4) throw new Error('Formato de dato cifrado invalido');
  const [, ivB64, tagB64, datoB64] = partes as [string, string, string, string];
  const decipher = createDecipheriv('aes-256-gcm', clave, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(datoB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Valor enmascarado unico que se muestra en formulario y respuestas: "•••• 1234". */
export function enmascarar(ultimos4: string): string {
  return `•••• ${ultimos4}`;
}
