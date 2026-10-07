import type { EstadoFormato, TipoFormato } from '@foest/shared';

/** Version de plantilla por tipo: forma parte del hash_contenido (cambiar la plantilla desactualiza lo generado). */
export const VERSION_PLANTILLA: Record<TipoFormato, string> = {
  'GE-F041': 'GE-F041-v1',
  'GE-F043': 'GE-F043-v1',
};

export const NOMBRE_FORMATO: Record<TipoFormato, string> = {
  'GE-F041': 'Formulario de Solicitud GE-F041',
  'GE-F043': 'Pagare con Carta de Instrucciones GE-F043',
};

export const BUCKET_FORMATOS = 'formatos';
export const SEGUNDOS_URL_DESCARGA = 300;

/** Fila de `formato_generado`. */
export interface FormatoRow {
  id: string;
  tipo: TipoFormato;
  postulacion_id: string;
  generado_por: string;
  estado: EstadoFormato;
  version_plantilla: string;
  hash_contenido: string;
  sha256_archivo: string | null;
  codigo_verificacion: string;
  storage_key: string | null;
  tamano_bytes: number | null;
  vigente: boolean;
  invalidado_en: string | null;
  motivo_invalidacion: string | null;
  detalle_error: string | null;
  generado_en: string;
}

export interface PerfilEfectivo {
  tipo_documento: string | null;
  numero_documento: string | null;
  expedido_en: string | null;
  nombres: string | null;
  apellidos: string | null;
  fecha_nacimiento: string | null;
  es_menor: boolean;
  genero: string | null;
  estado_civil: string | null;
  direccion: string | null;
  sector: string | null;
  celular_1: string | null;
  celular_2: string | null;
  correo_principal: string | null;
  correo_notificacion_2: string | null;
  estrato: number | null;
  sisben_categoria: string | null;
  sisben_puntaje: number | null;
  acudiente: AcudienteDatos | null;
}

export interface AcudienteDatos {
  tipo_documento: string | null;
  numero_documento: string | null;
  nombres: string | null;
  apellidos: string | null;
  parentesco: string | null;
  celular: string | null;
  correo: string | null;
}

export interface DeclaracionImpresa {
  codigo: string;
  version: number;
  titulo: string;
  texto: string;
}

/** Todo lo necesario para decidir, hashear y renderizar los formatos de una postulacion. */
export interface ContextoFormato {
  postulacion: {
    id: string;
    beneficiario_id: string;
    convocatoria_id: string;
    estado: string;
    tipo_solicitud: string;
    datos_formulario: Record<string, unknown>;
    correcciones_perfil: Record<string, unknown> | null;
    valor_matricula_letras: string | null;
    fecha_limite_subsanacion: string | null;
    ciclo: number;
  };
  convocatoria: { anio: number; semestre: number; nombre: string };
  beneficios: string[];
  beneficiario: { id: string; usuario_id: string; perfil_completo: boolean; es_menor: boolean };
  perfil: PerfilEfectivo;
  declaraciones: DeclaracionImpresa[];
  programa: { institucion: string | null; programa: string | null };
  pagareRequiereCodeudorMenores: boolean;
}

/** Datos de un formato: lo que entra al hash y el modelo de la plantilla. */
export interface DatosFormato {
  hashInput: Record<string, unknown>;
  vista: Record<string, unknown>;
}
