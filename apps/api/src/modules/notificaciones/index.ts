/**
 * API publica del modulo `notificaciones` para los demas modulos:
 *
 *   import { encolarNotificacion } from '../notificaciones';
 *   await encolarNotificacion({ usuario_id, tipo: 'POSTULACION_ENVIADA', titulo, mensaje, entidad: 'POSTULACION', entidad_id, url_destino, clave_dedup, payload: { convocatoria_nombre } });
 *
 * - `encolarNotificacion`: buzon in-app + evento de correo (outbox) segun el catalogo del tipo y las preferencias.
 * - `alertarAdministradores`: aviso SISTEMA a todos los administradores (solo buzon).
 * - `registrarFuenteRecordatorio`: patron ReminderSource para jobs de otros modulos (08:00 America/Bogota).
 * - `registrarResolverDestinatarios`: permite a `accounts` sustituir la resolucion de correos.
 */
export { notificacionesRoutes } from './notificaciones.routes';
export { encolarNotificacion, alertarAdministradores, procesarOutbox, recuperarAtascados } from './outbox.service';
export { registrarFuenteRecordatorio, ejecutarRecordatorios } from './notificaciones.jobs';
export { registrarResolverDestinatarios, type ResolverDestinatarios } from './ports/resolver-destinatarios.port';
export { type MailerPort, type MensajeCorreo, ConsoleMailer, SmtpMailer, __setMailerForTests } from './ports/mailer.port';
export type { EncolarNotificacionInput, EncolarNotificacionResultado, FuenteRecordatorio, PayloadOutbox, Destinatario } from './notificaciones.types';
