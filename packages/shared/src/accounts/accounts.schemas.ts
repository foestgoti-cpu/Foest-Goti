import { z } from 'zod';
import { TIPOS_DOCUMENTO_IDENTIDAD } from '../enums';
import { ConfirmarSchema, EmailSchema, MotivoSchema, FechaLocalSchema } from '../schemas';
import { PaginacionQuerySchema } from '../api';
import {
  DecisionHabeasSchema,
  EstadoCivilSchema,
  GeneroSchema,
  ParentescoSchema,
  SectorSchema,
  TipoSolicitudHabeasSchema,
  esMenorDeEdad,
} from './accounts.types';

/**
 * Esquemas Zod del modulo accounts, compartidos por API y web
 * (docs/modules/accounts.md, seccion 1 del formato GE-F041).
 */

const texto = (min: number, max: number) =>
  z
    .string({ required_error: 'Campo obligatorio', invalid_type_error: 'Campo obligatorio' })
    .trim()
    .min(min, `Debe tener al menos ${min} caracteres`)
    .max(max, `No puede superar ${max} caracteres`);

/** Tipo de documento con mensaje en espanol. */
const TipoDocumentoIdentidadSchema = z.enum(TIPOS_DOCUMENTO_IDENTIDAD, { errorMap: () => ({ message: 'Seleccione el tipo de documento' }) });

/** Numero de documento colombiano: 5 a 15 caracteres alfanumericos (PS admite letras). */
export const NumeroDocumentoSchema = z
  .string()
  .trim()
  .min(5, 'El numero de documento debe tener al menos 5 caracteres')
  .max(15, 'El numero de documento no puede superar 15 caracteres')
  .regex(/^[A-Za-z0-9]+$/, 'El numero de documento solo admite letras y numeros');

/** Celular colombiano: 10 digitos iniciando en 3. */
export const CelularSchema = z
  .string()
  .trim()
  .regex(/^3\d{9}$/, 'El celular debe tener 10 digitos y comenzar por 3');

const opcionalVacio = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());

// --- Funcionarios ---

export const CrearFuncionarioSchema = z
  .object({
    email: EmailSchema,
    nombres: texto(2, 80),
    apellidos: texto(2, 80),
    cargo: texto(2, 120),
    dependencia: texto(2, 120),
  })
  .strict();
export type CrearFuncionarioDto = z.infer<typeof CrearFuncionarioSchema>;

export const ActualizarFuncionarioSchema = z
  .object({
    nombres: texto(2, 80).optional(),
    apellidos: texto(2, 80).optional(),
    cargo: texto(2, 120).optional(),
    dependencia: texto(2, 120).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Debe enviar al menos un campo para actualizar' });
export type ActualizarFuncionarioDto = z.infer<typeof ActualizarFuncionarioSchema>;

/** Activar/deshabilitar una cuenta (funcionario, administrador o beneficiario). */
export const CambiarEstadoCuentaSchema = z
  .object({
    activo: z.boolean(),
    motivo: MotivoSchema,
    /** Solo funcionarios: deshabilita aunque existan expedientes pendientes (la reasignacion queda a cargo de asignaciones). */
    forzar: z.boolean().optional(),
  })
  .strict();
export type CambiarEstadoCuentaDto = z.infer<typeof CambiarEstadoCuentaSchema>;

/** Restablecimiento manual de la clave de un funcionario (doble intencion: motivo + confirmacion). */
export const RestablecerClaveSchema = z.object({ motivo: MotivoSchema, confirmar: ConfirmarSchema }).strict();
export type RestablecerClaveDto = z.infer<typeof RestablecerClaveSchema>;

export const ListarFuncionariosQuerySchema = PaginacionQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(['ACTIVO', 'INACTIVO']).optional(),
  dependencia: z.string().trim().max(120).optional(),
});
export type ListarFuncionariosQuery = z.infer<typeof ListarFuncionariosQuerySchema>;

export const ListarBeneficiariosQuerySchema = PaginacionQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(['ACTIVO', 'INACTIVO']).optional(),
});
export type ListarBeneficiariosQuery = z.infer<typeof ListarBeneficiariosQuerySchema>;

// --- Beneficiario: perfil (Seccion 1 GE-F041) ---

export const AcudienteSchema = z
  .object({
    tipo_documento: TipoDocumentoIdentidadSchema,
    numero_documento: NumeroDocumentoSchema,
    nombres: texto(2, 80),
    apellidos: texto(2, 80),
    parentesco: ParentescoSchema,
    celular: CelularSchema,
    correo: EmailSchema,
  })
  .strict();
export type AcudienteDto = z.infer<typeof AcudienteSchema>;

export const PerfilBeneficiarioSchema = z
  .object({
    tipo_documento: TipoDocumentoIdentidadSchema,
    numero_documento: NumeroDocumentoSchema,
    expedido_en: texto(2, 80),
    nombres: texto(2, 80),
    apellidos: texto(2, 80),
    fecha_nacimiento: z.string().min(1, 'Indique la fecha de nacimiento').pipe(FechaLocalSchema),
    genero: GeneroSchema,
    estado_civil: EstadoCivilSchema,
    direccion: texto(5, 200),
    sector: SectorSchema,
    celular_1: CelularSchema,
    celular_2: opcionalVacio(CelularSchema),
    correo_notificacion_2: EmailSchema,
    estrato: z.coerce.number({ invalid_type_error: 'Seleccione el estrato' }).int().min(1, 'Seleccione el estrato').max(6, 'Seleccione el estrato'),
    sisben_categoria: opcionalVacio(
      z.string().trim().toUpperCase().regex(/^[A-D]\d{1,2}$/, 'Categoria SISBEN no valida (ejemplo: B3)'),
    ),
    sisben_puntaje: opcionalVacio(z.coerce.number().min(0).max(100)),
    acudiente: opcionalVacio(AcudienteSchema),
  })
  .strict()
  .superRefine((v, ctx) => {
    const nacimiento = new Date(`${v.fecha_nacimiento}T00:00:00`);
    if (Number.isNaN(nacimiento.getTime()) || nacimiento > new Date()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fecha_nacimiento'], message: 'Fecha de nacimiento no valida' });
      return;
    }
    if (esMenorDeEdad(v.fecha_nacimiento) && !v.acudiente) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acudiente'],
        message: 'Por ser menor de edad debe registrar los datos de su acudiente',
      });
    }
    if (v.acudiente && v.acudiente.correo === v.correo_notificacion_2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acudiente', 'correo'],
        message: 'El correo del acudiente debe ser distinto del correo alternativo',
      });
    }
  });
export type PerfilBeneficiarioDto = z.infer<typeof PerfilBeneficiarioSchema>;

/** Campos obligatorios del perfil para `perfil_completo` (sin acudiente ni consentimiento, que se evaluan aparte). */
export const CAMPOS_OBLIGATORIOS_PERFIL = [
  'tipo_documento',
  'numero_documento',
  'expedido_en',
  'nombres',
  'apellidos',
  'fecha_nacimiento',
  'genero',
  'estado_civil',
  'direccion',
  'sector',
  'celular_1',
  'correo_notificacion_2',
  'estrato',
] as const;

export const CAMPO_PERFIL_ETIQUETA: Readonly<Record<string, string>> = {
  tipo_documento: 'Tipo de documento',
  numero_documento: 'Numero de documento',
  expedido_en: 'Lugar de expedicion',
  nombres: 'Nombres',
  apellidos: 'Apellidos',
  fecha_nacimiento: 'Fecha de nacimiento',
  genero: 'Genero',
  estado_civil: 'Estado civil',
  direccion: 'Direccion',
  sector: 'Sector',
  celular_1: 'Celular principal',
  correo_notificacion_2: 'Correo alternativo',
  estrato: 'Estrato',
  acudiente: 'Datos del acudiente',
  consentimiento: 'Consentimiento de tratamiento de datos (version vigente)',
};

// --- Administracion de beneficiarios ---

export const CorregirDocumentoSchema = z
  .object({
    tipo_documento: TipoDocumentoIdentidadSchema.optional(),
    numero_documento: NumeroDocumentoSchema,
    motivo: MotivoSchema,
  })
  .strict();
export type CorregirDocumentoDto = z.infer<typeof CorregirDocumentoSchema>;

// --- Habeas data ---

export const SolicitudHabeasDataSchema = z
  .object({
    tipo: TipoSolicitudHabeasSchema,
    detalle: z.string().trim().min(10, 'Describa su solicitud con al menos 10 caracteres').max(2000),
  })
  .strict();
export type SolicitudHabeasDataDto = z.infer<typeof SolicitudHabeasDataSchema>;

export const ResolverHabeasDataSchema = z
  .object({
    decision: DecisionHabeasSchema,
    motivo: MotivoSchema,
  })
  .strict();
export type ResolverHabeasDataDto = z.infer<typeof ResolverHabeasDataSchema>;

export const ListarHabeasDataQuerySchema = PaginacionQuerySchema.extend({
  estado: z.enum(['RADICADA', 'RESUELTA', 'RECHAZADA']).optional(),
});
export type ListarHabeasDataQuery = z.infer<typeof ListarHabeasDataQuerySchema>;

/** Contrasena definida por el funcionario al aceptar la invitacion (web). */
export { PasswordSchema as InvitacionPasswordSchema } from '../schemas';
