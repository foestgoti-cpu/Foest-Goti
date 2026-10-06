/**
 * Tipos del modulo (contratos compartidos con la API via @foest/shared).
 */
export type {
  ConfiguracionItem,
  FestivoItem,
  TipoConfiguracion,
  CategoriaConfiguracion,
  IesSnies,
  ProgramaSnies,
  ImportacionSnies,
  ErrorFilaSnies,
  ResumenImportacionSnies,
  DeclaracionJuramentada,
  TextoConsentimiento,
  ConsentimientoVigenteDto,
  DiasHabilesResultado,
} from '@foest/shared';
export { CATEGORIAS_CONFIGURACION, CLAVES_NO_EDITABLES, CODIGOS_DECLARACION } from '@foest/shared';

export interface ConfiguracionPublica {
  generado_en: string;
  valores: Record<string, string | null>;
}

export interface FestivoPropuesto {
  fecha: string;
  nombre: string;
}

export interface ResultadoCargaAnual {
  anio: number;
  eliminados: number;
  insertados: number;
}

export const ETIQUETA_CATEGORIA: Record<string, string> = {
  ACUERDO: 'Acuerdo',
  DOCUMENTOS: 'Documentos',
  PLAZOS: 'Plazos',
  ALERTAS: 'Alertas',
  SEGURIDAD: 'Seguridad',
  PRIVACIDAD: 'Privacidad',
  JURIDICO: 'Juridico',
  LABOR_SOCIAL: 'Labor social',
  NOTIFICACIONES: 'Notificaciones',
};
