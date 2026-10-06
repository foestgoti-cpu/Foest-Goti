import { z } from 'zod';
import {
  EmailSchema,
  FechaLocalSchema,
  PasswordSchema,
  TipoDocumentoIdentidadSchema,
  type Permiso,
  type Rol,
  type TipoDocumentoIdentidad,
} from '@foest/shared';

export interface UsuarioSesion {
  id: string;
  email: string;
  rol: Rol;
  forzar_cambio_clave: boolean;
}

export interface SesionRespuesta {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number | null;
}

export interface LoginRespuesta extends SesionRespuesta {
  usuario: UsuarioSesion;
}

export interface RegistroRespuesta {
  id: string;
  email: string;
  rol: Rol;
  requiere_verificacion: boolean;
}

export interface ConsentimientoVigente {
  version: number;
  texto: string;
}

export interface PerfilBasico {
  tipo: 'BENEFICIARIO' | 'FUNCIONARIO';
  id: string;
  nombres: string | null;
  apellidos: string | null;
  tipo_documento?: TipoDocumentoIdentidad | null;
  numero_documento?: string | null;
  es_menor?: boolean;
  perfil_completo?: boolean;
  cargo?: string | null;
  dependencia?: string | null;
}

export interface MeRespuesta {
  usuario: UsuarioSesion;
  permisos: Permiso[];
  perfil: PerfilBasico | null;
  forzar_cambio_clave: boolean;
}

/** Edad de mayoria (PERFIL_EDAD_MAYORIA = 18). */
export function esMenorDeEdad(fechaNacimiento: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) return false;
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00Z`);
  const hoy = new Date();
  let edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear();
  const m = hoy.getUTCMonth() - nacimiento.getUTCMonth();
  if (m < 0 || (m === 0 && hoy.getUTCDate() < nacimiento.getUTCDate())) edad -= 1;
  return edad < 18;
}

const AcudienteFormSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre del acudiente es obligatorio').max(200),
  tipo_documento: TipoDocumentoIdentidadSchema,
  numero_documento: z.string().trim().min(4, 'El documento del acudiente es obligatorio').max(30),
  correo: EmailSchema,
});

/** Formulario de registro (espejo de RegisterDto del API + confirmacion de contrasena). */
export const RegistroFormSchema = z
  .object({
    nombres: z.string().trim().min(2, 'Los nombres son obligatorios').max(120),
    apellidos: z.string().trim().min(2, 'Los apellidos son obligatorios').max(120),
    email: EmailSchema,
    fecha_nacimiento: FechaLocalSchema,
    tipo_documento: z.union([TipoDocumentoIdentidadSchema, z.literal('')]).optional(),
    numero_documento: z.string().trim().max(30).optional(),
    password: PasswordSchema,
    confirmar_password: z.string(),
    aceptar_consentimiento: z.boolean(),
    acudiente: AcudienteFormSchema.optional(),
  })
  .superRefine((d, ctx) => {
    if (d.password !== d.confirmar_password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmar_password'], message: 'Las contrasenas no coinciden' });
    }
    if (!d.aceptar_consentimiento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aceptar_consentimiento'],
        message: 'Debe aceptar el tratamiento de datos personales para continuar',
      });
    }
    if (esMenorDeEdad(d.fecha_nacimiento) && !d.acudiente) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acudiente'], message: 'Debe registrar los datos del acudiente' });
    }
  });
export type RegistroForm = z.infer<typeof RegistroFormSchema>;

export const NuevaPasswordSchema = z
  .object({ password: PasswordSchema, confirmar_password: z.string() })
  .refine((d) => d.password === d.confirmar_password, { path: ['confirmar_password'], message: 'Las contrasenas no coinciden' });

export const CambiarClaveFormSchema = z
  .object({
    password_actual: z.string().min(1, 'La contrasena actual es obligatoria'),
    password_nueva: PasswordSchema,
    confirmar_password: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.password_nueva !== d.confirmar_password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmar_password'], message: 'Las contrasenas no coinciden' });
    }
    if (d.password_actual === d.password_nueva) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password_nueva'], message: 'La nueva contrasena debe ser distinta de la actual' });
    }
  });

export const AYUDA_PASSWORD = 'Entre 8 y 64 caracteres, con al menos una letra mayuscula, un numero y un caracter especial.';
