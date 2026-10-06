import { z } from 'zod';
import { EmailSchema, FechaLocalSchema, LoginSchema, PasswordSchema, TipoDocumentoIdentidadSchema } from '@foest/shared';

/** DTOs del modulo auth (reutilizan los esquemas de @foest/shared). */

export const LoginDto = LoginSchema;
export type LoginBody = z.infer<typeof LoginDto>;

const AcudienteDto = z
  .object({
    nombre: z.string().trim().min(3).max(200),
    tipo_documento: TipoDocumentoIdentidadSchema,
    numero_documento: z.string().trim().min(4).max(30),
    correo: EmailSchema,
  })
  .strict();

export const RegisterDto = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    nombres: z.string().trim().min(2, 'Los nombres son obligatorios').max(120),
    apellidos: z.string().trim().min(2, 'Los apellidos son obligatorios').max(120),
    fecha_nacimiento: FechaLocalSchema,
    tipo_documento: TipoDocumentoIdentidadSchema.optional(),
    numero_documento: z.string().trim().min(4).max(30).optional(),
    aceptar_consentimiento: z.boolean(),
    /** Version del texto que el usuario leyo; si difiere de la vigente se rechaza. */
    version_consentimiento: z.number().int().min(1).optional(),
    acudiente: AcudienteDto.optional(),
  })
  .strict();
export type RegisterBody = z.infer<typeof RegisterDto>;

export const RefreshDto = z.object({ refresh_token: z.string().min(1) }).strict();
export type RefreshBody = z.infer<typeof RefreshDto>;

export const ForgotDto = z.object({ email: EmailSchema }).strict();
export type ForgotBody = z.infer<typeof ForgotDto>;

export const ResendDto = z.object({ email: EmailSchema }).strict();

export const ChangePasswordDto = z
  .object({
    password_actual: z.string().min(1, 'La contrasena actual es obligatoria'),
    password_nueva: PasswordSchema,
  })
  .strict()
  .refine((d) => d.password_actual !== d.password_nueva, {
    path: ['password_nueva'],
    message: 'La nueva contrasena debe ser distinta de la actual',
  });
export type ChangePasswordBody = z.infer<typeof ChangePasswordDto>;

export const AceptarInvitacionDto = z.object({ password: PasswordSchema }).strict();
export type AceptarInvitacionBody = z.infer<typeof AceptarInvitacionDto>;
