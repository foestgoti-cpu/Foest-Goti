import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../../../shared';
import { envNotificaciones } from '../notificaciones.env';

/**
 * Puerto de correo. Unica pieza del sistema que habla con el proveedor.
 *  - `SmtpMailer`: nodemailer con SMTP_HOST/PORT/USER/PASS y MAIL_FROM.
 *  - `ConsoleMailer`: desarrollo y pruebas; escribe asunto y destinatario en el log (nunca el cuerpo).
 */
export interface MensajeCorreo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  /** Cabeceras de correlacion (p. ej. X-FOEST-Evento). */
  cabeceras?: Record<string, string>;
}

export interface ResultadoEnvio {
  id_mensaje_proveedor: string | null;
}

export class ErrorEnvioCorreo extends Error {
  /** `true` si el proveedor indica que no tiene sentido reintentar (direccion invalida, 5xx de destinatario). */
  readonly permanente: boolean;
  /** `true` si es un rebote duro del destinatario (suprimir). */
  readonly reboteDuro: boolean;
  constructor(message: string, opciones: { permanente?: boolean; reboteDuro?: boolean } = {}) {
    super(message);
    this.name = 'ErrorEnvioCorreo';
    this.permanente = Boolean(opciones.permanente || opciones.reboteDuro);
    this.reboteDuro = Boolean(opciones.reboteDuro);
  }
}

export interface MailerPort {
  readonly nombre: string;
  enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvio>;
}

export class ConsoleMailer implements MailerPort {
  readonly nombre = 'console';
  async enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvio> {
    const id = `console-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    logger.info({ para: mensaje.para, asunto: mensaje.asunto, id_mensaje: id, mailer: this.nombre }, 'Correo simulado (ConsoleMailer)');
    return { id_mensaje_proveedor: id };
  }
}

const RE_PERMANENTE = /(550|551|553|5\.1\.1|5\.1\.2|5\.1\.3|user unknown|no such user|does not exist|invalid recipient|recipient address rejected|mailbox unavailable)/i;
const RE_REBOTE_DURO = /(550|5\.1\.1|5\.1\.2|user unknown|no such user|does not exist|invalid recipient|recipient address rejected)/i;

function clasificarErrorSmtp(e: unknown): ErrorEnvioCorreo {
  const err = e as { message?: string; responseCode?: number; response?: string; code?: string };
  const texto = `${err.responseCode ?? ''} ${err.response ?? ''} ${err.message ?? ''}`.trim();
  const codigo = err.responseCode ?? 0;
  const reboteDuro = RE_REBOTE_DURO.test(texto) || codigo === 550;
  const permanente = reboteDuro || RE_PERMANENTE.test(texto) || (codigo >= 500 && codigo < 600 && codigo !== 552 && codigo !== 554);
  return new ErrorEnvioCorreo(texto.slice(0, 500) || 'Fallo de envio SMTP', { permanente, reboteDuro });
}

export class SmtpMailer implements MailerPort {
  readonly nombre = 'smtp';
  private readonly transporte: Transporter;
  private readonly desde: string;

  constructor(opciones?: { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string }) {
    const env = envNotificaciones();
    const host = opciones?.host ?? env.SMTP_HOST;
    if (!host) throw new Error('SmtpMailer requiere SMTP_HOST');
    const user = opciones?.user ?? env.SMTP_USER;
    const pass = opciones?.pass ?? env.SMTP_PASS;
    this.desde = opciones?.from ?? env.MAIL_FROM;
    this.transporte = nodemailer.createTransport({
      host,
      port: opciones?.port ?? env.SMTP_PORT,
      secure: opciones?.secure ?? env.SMTP_SECURE,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }

  async enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvio> {
    try {
      const info = await this.transporte.sendMail({
        from: this.desde,
        to: mensaje.para,
        subject: mensaje.asunto,
        html: mensaje.html,
        text: mensaje.texto,
        headers: mensaje.cabeceras,
      });
      const rechazados = (info.rejected ?? []) as string[];
      if (rechazados.length > 0 && (info.accepted ?? []).length === 0) {
        throw new ErrorEnvioCorreo(`Destinatario rechazado por el servidor SMTP: ${String(info.response ?? '').slice(0, 300)}`, { reboteDuro: true });
      }
      return { id_mensaje_proveedor: typeof info.messageId === 'string' ? info.messageId : null };
    } catch (e) {
      if (e instanceof ErrorEnvioCorreo) throw e;
      throw clasificarErrorSmtp(e);
    }
  }
}

let instancia: MailerPort | null = null;

/** Mailer segun entorno: SMTP si hay SMTP_HOST (y no es test); consola en caso contrario. */
export function obtenerMailer(): MailerPort {
  if (instancia) return instancia;
  const env = envNotificaciones();
  if (env.SMTP_HOST && process.env.NODE_ENV !== 'test') {
    instancia = new SmtpMailer();
    logger.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, 'Mailer SMTP configurado');
  } else {
    instancia = new ConsoleMailer();
    if (process.env.NODE_ENV !== 'test') logger.warn('SMTP_HOST no configurado: los correos se escriben en el log (ConsoleMailer)');
  }
  return instancia;
}

/** Solo para pruebas o arranque: inyecta una implementacion. */
export function __setMailerForTests(mailer: MailerPort | null): void {
  instancia = mailer;
}
