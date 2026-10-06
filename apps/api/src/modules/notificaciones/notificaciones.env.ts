import { z } from 'zod';

/**
 * Variables de entorno propias del modulo (no se tocan en config/env.ts).
 * Todas son opcionales: sin SMTP_HOST se usa `ConsoleMailer` (desarrollo) y sin
 * MAIL_WEBHOOK_SECRET el webhook de rebotes responde 404 (deshabilitado).
 */
const EnvNotificacionesSchema = z.object({
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_SECURE: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  MAIL_FROM: z.string().min(3).default('Equipo FOEST <no-responder@foest.local>'),
  MAIL_WEBHOOK_SECRET: z.string().min(16).optional(),
  /** Base publica de la SPA para construir enlaces en los correos. */
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
});

export type EnvNotificaciones = z.infer<typeof EnvNotificacionesSchema>;

const vacio = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v);

let cache: EnvNotificaciones | null = null;

export function envNotificaciones(): EnvNotificaciones {
  if (cache) return cache;
  const r = EnvNotificacionesSchema.safeParse({
    SMTP_HOST: vacio(process.env.SMTP_HOST),
    SMTP_PORT: vacio(process.env.SMTP_PORT),
    SMTP_USER: vacio(process.env.SMTP_USER),
    SMTP_PASS: vacio(process.env.SMTP_PASS),
    SMTP_SECURE: vacio(process.env.SMTP_SECURE),
    MAIL_FROM: vacio(process.env.MAIL_FROM),
    MAIL_WEBHOOK_SECRET: vacio(process.env.MAIL_WEBHOOK_SECRET),
    WEB_ORIGIN: vacio(process.env.WEB_ORIGIN),
  });
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Variables de entorno de notificaciones invalidas: ${detalle}`);
  }
  cache = r.data;
  return cache;
}

/** Solo para pruebas: vuelve a leer `process.env` en la siguiente llamada. */
export function __reiniciarEnvNotificaciones(): void {
  cache = null;
}
