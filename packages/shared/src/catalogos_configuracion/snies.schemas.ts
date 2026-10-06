import { z } from 'zod';
import { PAGE_SIZE_DEFECTO } from '../api';

/** Catalogo SNIES (IES y programas). */
export const CARACTER_IES = ['UNIVERSIDAD', 'INSTITUCION_UNIVERSITARIA', 'TECNOLOGICA', 'TECNICA_PROFESIONAL'] as const;
export type CaracterIes = (typeof CARACTER_IES)[number];

export const SECTOR_IES = ['OFICIAL', 'PRIVADA'] as const;
export type SectorIes = (typeof SECTOR_IES)[number];

export const NIVEL_PROGRAMA = ['TECNICO', 'TECNOLOGICO', 'PROFESIONAL', 'ESPECIALIZACION', 'MAESTRIA', 'DOCTORADO'] as const;
export type NivelPrograma = (typeof NIVEL_PROGRAMA)[number];

export const MODALIDAD_PROGRAMA = ['PRESENCIAL', 'VIRTUAL', 'DISTANCIA', 'DUAL'] as const;
export type ModalidadPrograma = (typeof MODALIDAD_PROGRAMA)[number];

export const ESTADO_PROGRAMA = ['ACTIVO', 'INACTIVO'] as const;
export type EstadoPrograma = (typeof ESTADO_PROGRAMA)[number];

export interface IesSnies {
  codigo_snies: string;
  nombre: string;
  nombre_normalizado: string;
  caracter: CaracterIes | null;
  sector: SectorIes | null;
  departamento: string | null;
  municipio: string | null;
  activa: boolean;
  actualizado_en: string;
}

export interface ProgramaSnies {
  codigo_snies: string;
  ies_codigo: string;
  nombre: string;
  nombre_normalizado: string;
  nivel: NivelPrograma | null;
  modalidad: ModalidadPrograma | null;
  estado_programa: EstadoPrograma;
  departamento_oferta: string | null;
  municipio_oferta: string | null;
  activo: boolean;
  actualizado_en: string;
}

export interface ImportacionSnies {
  id: string;
  admin_id: string | null;
  archivo_nombre: string;
  sha256_archivo: string;
  modo: 'REAL' | 'SIMULACION';
  insertados: number;
  actualizados: number;
  desactivados: number;
  errores: ErrorFilaSnies[];
  ejecutada_en: string;
}

export interface ErrorFilaSnies {
  fila: number;
  mensaje: string;
}

export interface ResumenImportacionSnies {
  modo: 'REAL' | 'SIMULACION';
  ies_insertadas: number;
  ies_actualizadas: number;
  insertados: number;
  actualizados: number;
  desactivados: number;
  filas_leidas: number;
  errores: ErrorFilaSnies[];
  importacion_id: string | null;
}

/** Busqueda: maximo 50 por pagina (catalogos_configuracion.md). */
export const SNIES_PAGE_SIZE_MAXIMO = 50;

export const SniesBusquedaQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(SNIES_PAGE_SIZE_MAXIMO).default(PAGE_SIZE_DEFECTO),
});
export type SniesBusquedaQuery = z.infer<typeof SniesBusquedaQuerySchema>;

export const CodigoSniesParamSchema = z.object({ codigo_snies: z.string().trim().regex(/^\d{1,10}$/, 'Codigo SNIES numerico') });

export const SniesImportarQuerySchema = z.object({
  modo: z.enum(['real', 'simulacion']).default('real'),
  archivo_nombre: z.string().trim().max(200).optional(),
});
export type SniesImportarQuery = z.infer<typeof SniesImportarQuerySchema>;

/** Cuerpo JSON alternativo de la importacion (cuando no se envia text/csv). */
export const SniesImportarBodySchema = z
  .object({
    archivo_nombre: z.string().trim().min(1).max(200),
    contenido: z.string().min(1),
  })
  .strict();
export type SniesImportarBody = z.infer<typeof SniesImportarBodySchema>;
