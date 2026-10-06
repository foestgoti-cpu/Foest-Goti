import type { EstadoPostulacion, TipoSolicitud } from '@foest/shared';
import type { ObservacionPublica } from './observacion.publica';
import type { EstadoDocumentoPublico } from './estados.presentacion';

/* ----------------------------- Filas crudas ----------------------------- */

export interface FilaBeneficiario {
  id: string;
  usuario_id: string;
  nombres: string | null;
  apellidos: string | null;
  perfil_completo: boolean;
  es_menor: boolean;
}

export interface FilaConvocatoria {
  id: string;
  anio: number;
  semestre: number;
  nombre: string;
  descripcion: string;
  fecha_apertura: string;
  fecha_cierre_exclusiva: string;
  estado: string;
}

export interface FilaPostulacion {
  id: string;
  beneficiario_id: string;
  convocatoria_id: string;
  tipo_solicitud: TipoSolicitud;
  estado: EstadoPostulacion;
  ciclo: number;
  version: number;
  aprobacion_parcial: boolean;
  fecha_limite_subsanacion: string | null;
  enviada_en: string | null;
  correccion_vigente: unknown;
  creado_en: string;
  actualizado_en: string;
}

export interface FilaHistorial {
  id: string;
  postulacion_id: string;
  ciclo: number;
  estado_anterior: EstadoPostulacion | null;
  estado_nuevo: EstadoPostulacion;
  motivo: string;
  observaciones: string | null;
  cambiado_en: string;
}

export interface FilaEnvio {
  id: string;
  postulacion_id: string;
  ciclo: number;
  enviado_en: string;
}

export interface FilaNotificacion {
  id: string;
  usuario_id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  entidad: string | null;
  entidad_id: string | null;
  url_destino: string | null;
  severidad: 'INFO' | 'ADVERTENCIA' | 'CRITICA';
  leida: boolean;
  leida_en: string | null;
  creada_en: string;
}

/* ------------------------------ DTO publicos ----------------------------- */

export type TipoAccionPendiente =
  | 'BORRADOR_POR_VENCER'
  | 'DOCUMENTOS_POR_CORREGIR'
  | 'NOTIFICACION_CRITICA'
  | 'OTORGAMIENTO_INFO'
  | 'DESEMBOLSO_INFO';

export type PrioridadAccion = 'ALTA' | 'MEDIA' | 'BAJA';

export interface AccionPendienteDto {
  tipo: TipoAccionPendiente;
  prioridad: PrioridadAccion;
  postulacion_id: string | null;
  titulo: string;
  descripcion: string;
  fecha_limite: string | null;
  /** Fecha limite formateada en America/Bogota, lista para mostrar. */
  fecha_limite_texto: string | null;
  accion_url: string;
  etiqueta_accion: string;
}

export interface ConvocatoriaPublicaDto {
  id: string;
  nombre: string;
  anio: number;
  semestre: number;
  descripcion: string;
  fecha_apertura: string;
  fecha_cierre_exclusiva: string;
  /** Cierre presentado al beneficiario (23:59:59 del dia anterior al exclusivo, hora de Bogota). */
  fecha_cierre_texto: string;
  dias_restantes: number;
}

export interface PostulacionResumenDto {
  id: string;
  convocatoria: { id: string; nombre: string; anio: number; semestre: number } | null;
  tipo_solicitud: TipoSolicitud;
  estado: EstadoPostulacion;
  estado_texto: string;
  estado_descripcion: string;
  requiere_accion: boolean;
  terminal: boolean;
  ciclo: number;
  aprobacion_parcial: boolean;
  fecha_limite_subsanacion: string | null;
  fecha_limite_subsanacion_texto: string | null;
  enviada_en: string | null;
  actualizado_en: string;
}

export interface ResumenDto {
  saludo: { nombre: string | null; perfil_completo: boolean; tiene_perfil: boolean };
  convocatoria_abierta: ConvocatoriaPublicaDto | null;
  proxima_apertura_estimada: string | null;
  proxima_apertura_texto: string | null;
  mensaje_convocatoria: string;
  postulacion_actual: PostulacionResumenDto | null;
  /** `true` cuando hay convocatoria abierta y el beneficiario aun no tiene postulacion en ella. */
  puede_iniciar_postulacion: boolean;
  postulaciones: PostulacionResumenDto[];
  acciones_pendientes: AccionPendienteDto[];
  notificaciones: { no_leidas: number; criticas_no_leidas: number };
  pendiente_modulo: { otorgamientos: boolean };
  generado_en: string;
}

export interface HitoDto {
  id: string;
  fecha: string;
  fecha_texto: string;
  ciclo: number;
  estado: EstadoPostulacion;
  titulo: string;
  descripcion: string;
  observacion: ObservacionPublica | null;
  /** `true` para el hito mas reciente (estado actual). */
  actual: boolean;
}

export interface ResultadoBeneficioDto {
  beneficio_codigo: string;
  beneficio_nombre: string;
  decision: 'APROBADO' | 'RECHAZADO';
  decision_texto: string;
  motivo_publico: string | null;
  monto_aprobado: number | null;
}

export interface LineaTiempoDto {
  postulacion: PostulacionResumenDto;
  hitos: HitoDto[];
  ciclos: Array<{ ciclo: number; enviado_en: string; enviado_en_texto: string }>;
  resultado_por_beneficio: ResultadoBeneficioDto[];
  pendiente_modulo: { evaluacion: boolean };
}

export interface DocumentoChecklistDto {
  tipo_id: string;
  tipo_codigo: string | null;
  tipo_nombre: string;
  documento_id: string | null;
  estado: EstadoDocumentoPublico;
  estado_texto: string;
  observacion: ObservacionPublica | null;
  obligatorio: boolean;
}

export interface DocumentosDto {
  postulacion_id: string;
  ciclo: number;
  documentos: DocumentoChecklistDto[];
  pendiente_modulo: { documentos: boolean; evaluacion: boolean };
}

export interface DescargaDto {
  id: string;
  tipo: string;
  nombre: string;
  postulacion_id: string | null;
  estado: 'VIGENTE' | 'DESACTUALIZADO' | 'GENERANDO' | 'FALLIDO';
  estado_texto: string;
  generado_en: string | null;
  url_descarga: string;
}

export interface DescargasDto {
  descargas: DescargaDto[];
  pendiente_modulo: { formatos: boolean; labor_social: boolean };
}

export interface DesembolsoDto {
  id: string;
  fecha: string | null;
  fecha_texto: string | null;
  estado: string;
  estado_texto: string;
  monto: number | null;
  referencia_pago: string | null;
  concepto: string | null;
}

export interface OtorgamientoDto {
  id: string;
  postulacion_id: string;
  beneficio_codigo: string;
  beneficio_nombre: string;
  estado: string;
  estado_texto: string;
  monto_aprobado: number | null;
  otorgado_en: string | null;
  motivo_publico: string | null;
  cuenta_pago: { tipo: string; entidad: string | null; ultimos4: string } | null;
  desembolsos: DesembolsoDto[];
}

export interface OtorgamientosDto {
  otorgamientos: OtorgamientoDto[];
  pendiente_modulo: { seguimiento: boolean };
}
