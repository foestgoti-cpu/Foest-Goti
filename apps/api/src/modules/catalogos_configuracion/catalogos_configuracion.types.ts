/**
 * Tipos internos del modulo catalogos_configuracion. Los tipos de contrato
 * (ConfiguracionItem, FestivoItem, IesSnies, ProgramaSnies, DeclaracionJuramentada,
 * TextoConsentimiento, ...) viven en @foest/shared/catalogos_configuracion.
 */
export type {
  ConfiguracionItem,
  FestivoItem,
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

/** Respuesta de GET /configuracion/publica. */
export interface ConfiguracionPublica {
  generado_en: string;
  valores: Record<string, string | null>;
}

/** Fila normalizada del CSV SNIES lista para upsert. */
export interface FilaSniesNormalizada {
  ies: {
    codigo_snies: string;
    nombre: string;
    nombre_normalizado: string;
    caracter: string | null;
    sector: string | null;
    departamento: string | null;
    municipio: string | null;
  };
  programa: {
    codigo_snies: string;
    ies_codigo: string;
    nombre: string;
    nombre_normalizado: string;
    nivel: string | null;
    modalidad: string | null;
    estado_programa: 'ACTIVO' | 'INACTIVO';
    departamento_oferta: string | null;
    municipio_oferta: string | null;
  };
}

export interface ResultadoCargaAnual {
  anio: number;
  eliminados: number;
  insertados: number;
}
