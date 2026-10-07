import QRCode from 'qrcode';
import { env } from '../../config/env';

/**
 * QR del codigo de verificacion. El QR contiene unicamente la URL publica de verificacion con el
 * codigo aleatorio: ni hash, ni identificadores, ni datos personales.
 */
export function urlVerificacion(codigo: string): string {
  return `${env.WEB_ORIGIN.replace(/\/$/, '')}/verificar/${encodeURIComponent(codigo)}`;
}

/** SVG del QR como data URI (se inserta en la plantilla con doble llave, sin HTML crudo). */
export async function generarQrDataUri(codigo: string): Promise<string> {
  const svg = await QRCode.toString(urlVerificacion(codigo), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
