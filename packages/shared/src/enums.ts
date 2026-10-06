import { z } from 'zod';

/**
 * Enums canonicos de la plataforma (DECISIONES.md secciones 3, 4, 5, 6).
 * Se declaran como objetos `as const` + esquema Zod para que sirvan tanto en
 * tiempo de compilacion (tipos) como en tiempo de ejecucion (validacion).
 */

// --- Roles (DECISIONES section 3 / section 19) ---
export const ROLES = ['ADMINISTRADOR', 'FUNCIONARIO', 'BENEFICIARIO'] as const;
export const RolSchema = z.enum(ROLES);
export type Rol = z.infer<typeof RolSchema>;
export const Rol = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  FUNCIONARIO: 'FUNCIONARIO',
  BENEFICIARIO: 'BENEFICIARIO',
} as const satisfies Record<Rol, Rol>;

// --- Estado de postulacion (DECISIONES section 4) ---
export const ESTADOS_POSTULACION = [
  'BORRADOR',
  'PENDIENTE',
  'EN_EVALUACION',
  'EN_CORRECCION',
  'APROBADA',
  'RECHAZADA',
  'DESISTIDA',
] as const;
export const EstadoPostulacionSchema = z.enum(ESTADOS_POSTULACION);
export type EstadoPostulacion = z.infer<typeof EstadoPostulacionSchema>;
export const EstadoPostulacion = {
  BORRADOR: 'BORRADOR',
  PENDIENTE: 'PENDIENTE',
  EN_EVALUACION: 'EN_EVALUACION',
  EN_CORRECCION: 'EN_CORRECCION',
  APROBADA: 'APROBADA',
  RECHAZADA: 'RECHAZADA',
  DESISTIDA: 'DESISTIDA',
} as const satisfies Record<EstadoPostulacion, EstadoPostulacion>;

/** Estados terminales: ninguna transicion sale de ellos (servicio + trigger de BD). */
export const ESTADOS_POSTULACION_TERMINALES: readonly EstadoPostulacion[] = [
  'APROBADA',
  'RECHAZADA',
  'DESISTIDA',
];
export const esEstadoTerminal = (estado: EstadoPostulacion): boolean =>
  ESTADOS_POSTULACION_TERMINALES.includes(estado);

// --- Estado de convocatoria (DECISIONES section 5) ---
export const ESTADOS_CONVOCATORIA = ['BORRADOR', 'HABILITADA', 'SUSPENDIDA', 'CERRADA', 'ARCHIVADA'] as const;
export const EstadoConvocatoriaSchema = z.enum(ESTADOS_CONVOCATORIA);
export type EstadoConvocatoria = z.infer<typeof EstadoConvocatoriaSchema>;
export const EstadoConvocatoria = {
  BORRADOR: 'BORRADOR',
  HABILITADA: 'HABILITADA',
  SUSPENDIDA: 'SUSPENDIDA',
  CERRADA: 'CERRADA',
  ARCHIVADA: 'ARCHIVADA',
} as const satisfies Record<EstadoConvocatoria, EstadoConvocatoria>;

// --- Tipo de solicitud / tramite ---
export const TIPOS_SOLICITUD = ['PRIMERA_VEZ', 'RENOVACION', 'REINTEGRO'] as const;
export const TipoSolicitudSchema = z.enum(TIPOS_SOLICITUD);
export type TipoSolicitud = z.infer<typeof TipoSolicitudSchema>;
export const TipoSolicitud = {
  PRIMERA_VEZ: 'PRIMERA_VEZ',
  RENOVACION: 'RENOVACION',
  REINTEGRO: 'REINTEGRO',
} as const satisfies Record<TipoSolicitud, TipoSolicitud>;

// --- Catalogo unico de beneficios (DECISIONES section 6) ---
export const CODIGOS_BENEFICIO = [
  'S11',
  'EA',
  'DEP',
  'CUL',
  'SUP',
  'ST',
  'LE1',
  'LE2',
  'LE3',
  'LE4',
  'LE5',
  'LE6',
] as const;
export const CodigoBeneficioSchema = z.enum(CODIGOS_BENEFICIO);
export type CodigoBeneficio = z.infer<typeof CodigoBeneficioSchema>;
export const CodigoBeneficio = {
  S11: 'S11',
  EA: 'EA',
  DEP: 'DEP',
  CUL: 'CUL',
  SUP: 'SUP',
  ST: 'ST',
  LE1: 'LE1',
  LE2: 'LE2',
  LE3: 'LE3',
  LE4: 'LE4',
  LE5: 'LE5',
  LE6: 'LE6',
} as const satisfies Record<CodigoBeneficio, CodigoBeneficio>;

export const CATEGORIAS_BENEFICIO = ['MATRICULA', 'TRANSPORTE', 'ESPECIAL'] as const;
export const CategoriaBeneficioSchema = z.enum(CATEGORIAS_BENEFICIO);
export type CategoriaBeneficio = z.infer<typeof CategoriaBeneficioSchema>;

/** Catalogo de referencia (nombre y categoria). La fuente persistida es la tabla `beneficio`. */
export const BENEFICIOS_CATALOGO: ReadonlyArray<{
  codigo: CodigoBeneficio;
  nombre: string;
  categoria: CategoriaBeneficio;
}> = [
  { codigo: 'S11', nombre: 'Saber 11', categoria: 'ESPECIAL' },
  { codigo: 'EA', nombre: 'Excelencia Academica', categoria: 'ESPECIAL' },
  { codigo: 'DEP', nombre: 'Deporte', categoria: 'ESPECIAL' },
  { codigo: 'CUL', nombre: 'Cultura', categoria: 'ESPECIAL' },
  { codigo: 'SUP', nombre: 'Matricula Educacion Superior', categoria: 'MATRICULA' },
  { codigo: 'ST', nombre: 'Subsidio de Transporte', categoria: 'TRANSPORTE' },
  { codigo: 'LE1', nombre: 'Linea Especial 1', categoria: 'ESPECIAL' },
  { codigo: 'LE2', nombre: 'Linea Especial 2', categoria: 'ESPECIAL' },
  { codigo: 'LE3', nombre: 'Linea Especial 3', categoria: 'ESPECIAL' },
  { codigo: 'LE4', nombre: 'Linea Especial 4', categoria: 'ESPECIAL' },
  { codigo: 'LE5', nombre: 'Linea Especial 5', categoria: 'ESPECIAL' },
  { codigo: 'LE6', nombre: 'Linea Especial 6', categoria: 'ESPECIAL' },
];

// --- Otros enums transversales ---
export const TIPOS_DOCUMENTO_IDENTIDAD = ['CC', 'TI', 'CE', 'PS'] as const;
export const TipoDocumentoIdentidadSchema = z.enum(TIPOS_DOCUMENTO_IDENTIDAD);
export type TipoDocumentoIdentidad = z.infer<typeof TipoDocumentoIdentidadSchema>;

export const ACTORES_TIPO = ['BENEFICIARIO', 'FUNCIONARIO', 'ADMINISTRADOR', 'SISTEMA'] as const;
export const ActorTipoSchema = z.enum(ACTORES_TIPO);
export type ActorTipo = z.infer<typeof ActorTipoSchema>;

export const MOTIVOS_TRANSICION = [
  'CREACION',
  'ENVIO',
  'TOMA',
  'LIBERACION',
  'CONFLICTO_INTERES',
  'REASIGNACION',
  'DICTAMEN_APROBADO',
  'DICTAMEN_RECHAZADO',
  'DICTAMEN_CORRECCION',
  'SUBSANACION',
  'VENCIMIENTO_SUBSANACION',
  'DESISTIMIENTO',
] as const;
export const MotivoTransicionSchema = z.enum(MOTIVOS_TRANSICION);
export type MotivoTransicion = z.infer<typeof MotivoTransicionSchema>;
