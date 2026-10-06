import { z } from 'zod';

/**
 * Esquemas Zod reutilizables por los modulos (api y web).
 */

export const UuidSchema = z.string().uuid();

/** Parametro de ruta `:id` como uuid. */
export const IdParamSchema = z.object({ id: UuidSchema });

/** Contrasena: 8-64 caracteres, una mayuscula, un numero y un caracter especial (DECISIONES section 7). */
export const PasswordSchema = z
  .string()
  .min(8, 'La contrasena debe tener al menos 8 caracteres')
  .max(64, 'La contrasena no puede superar 64 caracteres')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayuscula')
  .regex(/[0-9]/, 'Debe incluir al menos un numero')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un caracter especial');

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Correo electronico no valido');

/** Motivo obligatorio para acciones administrativas (minimo 15 caracteres). */
export const MotivoSchema = z.string().trim().min(15, 'El motivo debe tener al menos 15 caracteres').max(2000);

/** Confirmacion explicita de doble intencion para acciones criticas. */
export const ConfirmarSchema = z.literal(true, {
  errorMap: () => ({ message: 'Se requiere confirmacion explicita (confirmar: true)' }),
});

/** Version para bloqueo optimista. */
export const VersionSchema = z.number().int().min(0);

/** Periodo academico `AAAA-S` (p. ej. 2026-1). */
export const PeriodoSchema = z
  .string()
  .regex(/^\d{4}-[12]$/, 'Formato esperado AAAA-S (ejemplo 2026-1)');

/** Fecha local `YYYY-MM-DD`. */
export const FechaLocalSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD');

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'La contrasena es obligatoria'),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const RegistroSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    aceptar_consentimiento: z.literal(true, {
      errorMap: () => ({ message: 'Debe aceptar el tratamiento de datos personales' }),
    }),
  })
  .strict();
export type RegistroDto = z.infer<typeof RegistroSchema>;
