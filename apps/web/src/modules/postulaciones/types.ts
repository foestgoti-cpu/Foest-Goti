import type { CodigoBeneficio, EstadoPostulacion, SeccionFormulario, TipoSolicitud } from '@foest/shared';

export interface ConvocatoriaResumen {
  id: string;
  nombre: string;
  anio: number;
  semestre: number;
  estado: string;
  fecha_apertura: string;
  fecha_cierre_exclusiva: string;
  beneficios_ofertados?: CodigoBeneficio[];
}

export interface ObservacionPublica {
  firma: 'Equipo FOEST';
  observaciones: string | null;
  campos_observados: string[];
  documentos_observados: string[];
}

export interface DatosPagoEnmascarado {
  tipo: 'CUENTA_BANCARIA' | 'BILLETERA';
  entidad: string;
  numero_enmascarado: string;
}

/** `datos_formulario` tal como lo devuelve la API (secciones parciales). */
export interface DatosFormulario {
  seccion_3?: Record<string, unknown>;
  seccion_4?: Record<string, unknown>;
  seccion_5?: Record<string, unknown>;
  seccion_6?: Record<string, unknown>;
  seccion_7?: Record<string, unknown>;
  seccion_8?: Record<string, unknown> & { datos_pago?: DatosPagoEnmascarado };
  seccion_9?: { declaraciones?: Array<{ codigo: string; version: number; aceptada: boolean }> };
}

export interface Postulacion {
  id: string;
  convocatoria_id: string;
  convocatoria: ConvocatoriaResumen | null;
  tipo_solicitud: TipoSolicitud;
  estado: EstadoPostulacion;
  estado_texto: string;
  beneficios: CodigoBeneficio[];
  datos_formulario: DatosFormulario;
  valor_matricula_letras: string | null;
  ciclo: number;
  version: number;
  aprobacion_parcial: boolean;
  fecha_limite_subsanacion: string | null;
  enviada_en: string | null;
  correccion_vigente: ObservacionPublica | null;
  creado_en: string;
  actualizado_en: string;
}

export interface PostulacionAdmin extends Omit<Postulacion, 'correccion_vigente'> {
  beneficiario_id: string;
  beneficiario: { nombres: string | null; apellidos: string | null; tipo_documento: string | null; numero_documento: string | null } | null;
  correccion_vigente: Record<string, unknown> | null;
  correcciones_perfil: Record<string, unknown> | null;
}

export interface CampoFaltante {
  seccion: SeccionFormulario;
  seccion_titulo: string;
  campo: string;
  mensaje: string;
}

export interface DeclaracionVigente {
  codigo: string;
  version: number;
  titulo: string;
  texto: string;
  texto_oficial_confirmado: boolean;
}

export interface Validacion {
  completo: boolean;
  secciones_aplicables: SeccionFormulario[];
  secciones_completas: SeccionFormulario[];
  campos_faltantes: CampoFaltante[];
  declaraciones: { vigentes: DeclaracionVigente[]; pendientes: string[]; texto_oficial_confirmado: boolean };
  documentos: { pendiente_modulo: true } | { pendiente_modulo: false; faltantes: Array<{ tipo: string; obligatorio: boolean; estado: string }> };
  formatos: { pendiente_modulo: true };
  perfil_completo: boolean;
  errores: string[];
}

export interface ResultadoEnvio {
  postulacion_id: string;
  estado: EstadoPostulacion;
  ciclo: number;
  version: number;
  hash_envio: string;
  enviado_en: string;
  repetido: boolean;
  postulacion: Postulacion;
}

export interface HistorialItem {
  id: string;
  ciclo: number;
  estado_anterior: EstadoPostulacion | null;
  estado_nuevo: EstadoPostulacion;
  estado_texto: string;
  motivo: string;
  quien: 'Usted' | 'Equipo FOEST' | 'Sistema';
  observaciones: string | null;
  cambiado_en: string;
}

export interface HistorialAdminItem {
  id: string;
  ciclo: number;
  estado_anterior: EstadoPostulacion | null;
  estado_nuevo: EstadoPostulacion;
  motivo: string;
  actor_tipo: string;
  actor_id: string | null;
  observaciones: string | null;
  cambiado_en: string;
}

export interface GuardarPayload {
  version: number;
  datos_formulario?: Partial<Record<Exclude<SeccionFormulario, 'seccion_1' | 'seccion_2'>, Record<string, unknown>>>;
  beneficios?: CodigoBeneficio[];
  datos_pago?: { tipo: 'CUENTA_BANCARIA' | 'BILLETERA'; entidad: string; numero: string };
}

export interface FiltrosAdmin {
  page: number;
  convocatoria_id?: string;
  estado?: EstadoPostulacion | '';
  tipo_solicitud?: TipoSolicitud | '';
  q?: string;
}
