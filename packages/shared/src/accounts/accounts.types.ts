import { z } from 'zod';

/**
 * Enums y utilidades del modulo accounts (docs/modules/accounts.md).
 * `TipoDocumentoIdentidad` ya existe en enums.ts; aqui van los propios del modulo.
 */

export const PARENTESCOS = ['MADRE', 'PADRE', 'ABUELO_A', 'TIO_A', 'HERMANO_A', 'TUTOR_LEGAL', 'OTRO'] as const;
export const ParentescoSchema = z.enum(PARENTESCOS, { errorMap: () => ({ message: 'Seleccione el parentesco' }) });
export type Parentesco = z.infer<typeof ParentescoSchema>;
export const PARENTESCO_ETIQUETA: Readonly<Record<Parentesco, string>> = {
  MADRE: 'Madre',
  PADRE: 'Padre',
  ABUELO_A: 'Abuelo o abuela',
  TIO_A: 'Tio o tia',
  HERMANO_A: 'Hermano o hermana',
  TUTOR_LEGAL: 'Tutor legal',
  OTRO: 'Otro',
};

export const GENEROS = ['FEMENINO', 'MASCULINO', 'OTRO', 'PREFIERO_NO_DECIR'] as const;
export const GeneroSchema = z.enum(GENEROS, { errorMap: () => ({ message: 'Seleccione el genero' }) });
export type Genero = z.infer<typeof GeneroSchema>;
export const GENERO_ETIQUETA: Readonly<Record<Genero, string>> = {
  FEMENINO: 'Femenino',
  MASCULINO: 'Masculino',
  OTRO: 'Otro',
  PREFIERO_NO_DECIR: 'Prefiero no decir',
};

export const ESTADOS_CIVILES = ['SOLTERO_A', 'CASADO_A', 'UNION_LIBRE', 'SEPARADO_A', 'DIVORCIADO_A', 'VIUDO_A'] as const;
export const EstadoCivilSchema = z.enum(ESTADOS_CIVILES, { errorMap: () => ({ message: 'Seleccione el estado civil' }) });
export type EstadoCivil = z.infer<typeof EstadoCivilSchema>;
export const ESTADO_CIVIL_ETIQUETA: Readonly<Record<EstadoCivil, string>> = {
  SOLTERO_A: 'Soltero(a)',
  CASADO_A: 'Casado(a)',
  UNION_LIBRE: 'Union libre',
  SEPARADO_A: 'Separado(a)',
  DIVORCIADO_A: 'Divorciado(a)',
  VIUDO_A: 'Viudo(a)',
};

export const SECTORES = ['Urbano', 'Rural'] as const;
export const SectorSchema = z.enum(SECTORES, { errorMap: () => ({ message: 'Seleccione el sector' }) });
export type Sector = z.infer<typeof SectorSchema>;

export const TIPOS_SOLICITUD_HABEAS = ['ACCESO', 'RECTIFICACION', 'SUPRESION'] as const;
export const TipoSolicitudHabeasSchema = z.enum(TIPOS_SOLICITUD_HABEAS);
export type TipoSolicitudHabeas = z.infer<typeof TipoSolicitudHabeasSchema>;
export const TIPO_SOLICITUD_HABEAS_ETIQUETA: Readonly<Record<TipoSolicitudHabeas, string>> = {
  ACCESO: 'Acceso a mis datos',
  RECTIFICACION: 'Rectificacion de datos',
  SUPRESION: 'Supresion de datos',
};

export const ESTADOS_SOLICITUD_HABEAS = ['RADICADA', 'RESUELTA', 'RECHAZADA'] as const;
export const EstadoSolicitudHabeasSchema = z.enum(ESTADOS_SOLICITUD_HABEAS);
export type EstadoSolicitudHabeas = z.infer<typeof EstadoSolicitudHabeasSchema>;

export const DECISIONES_HABEAS = ['APROBAR', 'RECHAZAR'] as const;
export const DecisionHabeasSchema = z.enum(DECISIONES_HABEAS);
export type DecisionHabeas = z.infer<typeof DecisionHabeasSchema>;

/** Edad de mayoria (CONFIG PERFIL_EDAD_MAYORIA; fija en 18 por ley). */
export const EDAD_MAYORIA = 18;

/** Calcula la edad en anios cumplidos a una fecha de referencia. */
export function edadEnAnios(fechaNacimiento: string | Date, referencia: Date = new Date()): number {
  const nacimiento = typeof fechaNacimiento === 'string' ? new Date(`${fechaNacimiento}T00:00:00`) : fechaNacimiento;
  if (Number.isNaN(nacimiento.getTime())) return 0;
  let edad = referencia.getFullYear() - nacimiento.getFullYear();
  const mes = referencia.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && referencia.getDate() < nacimiento.getDate())) edad -= 1;
  return edad;
}

/** `true` si la persona es menor de edad segun su fecha de nacimiento. */
export function esMenorDeEdad(fechaNacimiento: string | Date | null | undefined, referencia: Date = new Date()): boolean {
  if (!fechaNacimiento) return false;
  return edadEnAnios(fechaNacimiento, referencia) < EDAD_MAYORIA;
}
