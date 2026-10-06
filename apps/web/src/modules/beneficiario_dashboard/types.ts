import type { EstadoPostulacion, TipoSolicitud } from '@foest/shared';

/** Tipos de respuesta de `/api/v1/dashboard/beneficiario/*` y `/api/v1/notificaciones/*`. */

export type TipoAccionPendiente = 'BORRADOR_POR_VENCER' | 'DOCUMENTOS_POR_CORREGIR' | 'NOTIFICACION_CRITICA' | 'OTORGAMIENTO_INFO' | 'DESEMBOLSO_INFO';
export type PrioridadAccion = 'ALTA' | 'MEDIA' | 'BAJA';

export interface AccionPendiente {
  tipo: TipoAccionPendiente;
  prioridad: PrioridadAccion;
  postulacion_id: string | null;
  titulo: string;
  descripcion: string;
  fecha_limite: string | null;
  fecha_limite_texto: string | null;
  accion_url: string;
  etiqueta_accion: string;
}

export interface ConvocatoriaPublica {
  id: string;
  nombre: string;
  anio: number;
  semestre: number;
  descripcion: string;
  fecha_apertura: string;
  fecha_cierre_exclusiva: string;
  fecha_cierre_texto: string;
  dias_restantes: number;
}

export interface PostulacionResumen {
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

export interface Resumen {
  saludo: { nombre: string | null; perfil_completo: boolean; tiene_perfil: boolean };
  convocatoria_abierta: ConvocatoriaPublica | null;
  proxima_apertura_estimada: string | null;
  proxima_apertura_texto: string | null;
  mensaje_convocatoria: string;
  postulacion_actual: PostulacionResumen | null;
  puede_iniciar_postulacion: boolean;
  postulaciones: PostulacionResumen[];
  acciones_pendientes: AccionPendiente[];
  notificaciones: { no_leidas: number; criticas_no_leidas: number };
  pendiente_modulo: { otorgamientos: boolean };
  generado_en: string;
}

export interface ObservacionPublica {
  fecha: string;
  firma: string;
  texto: string;
  campos_observados: string[];
  documentos_observados: string[];
}

export interface Hito {
  id: string;
  fecha: string;
  fecha_texto: string;
  ciclo: number;
  estado: EstadoPostulacion;
  titulo: string;
  descripcion: string;
  observacion: ObservacionPublica | null;
  actual: boolean;
}

export interface ResultadoBeneficio {
  beneficio_codigo: string;
  beneficio_nombre: string;
  decision: 'APROBADO' | 'RECHAZADO';
  decision_texto: string;
  motivo_publico: string | null;
  monto_aprobado: number | null;
}

export interface LineaTiempo {
  postulacion: PostulacionResumen;
  hitos: Hito[];
  ciclos: Array<{ ciclo: number; enviado_en: string; enviado_en_texto: string }>;
  resultado_por_beneficio: ResultadoBeneficio[];
  pendiente_modulo: { evaluacion: boolean };
}

export type EstadoDocumento = 'APROBADO' | 'POR_CORREGIR' | 'PENDIENTE' | 'NO_APLICA' | 'PROCESANDO' | 'ARCHIVO_RECHAZADO' | 'SIN_CARGAR';

export interface DocumentoChecklist {
  tipo_id: string;
  tipo_codigo: string | null;
  tipo_nombre: string;
  documento_id: string | null;
  estado: EstadoDocumento;
  estado_texto: string;
  observacion: ObservacionPublica | null;
  obligatorio: boolean;
}

export interface Documentos {
  postulacion_id: string;
  ciclo: number;
  documentos: DocumentoChecklist[];
  pendiente_modulo: { documentos: boolean; evaluacion: boolean };
}

export interface Descarga {
  id: string;
  tipo: string;
  nombre: string;
  postulacion_id: string | null;
  estado: 'VIGENTE' | 'DESACTUALIZADO' | 'GENERANDO' | 'FALLIDO';
  estado_texto: string;
  generado_en: string | null;
  /** Ruta de la API que devuelve `{ url, expira_en }` (formatos_oficiales). */
  url_descarga: string;
}

export interface Descargas {
  descargas: Descarga[];
  pendiente_modulo: { formatos: boolean; labor_social: boolean };
}

export interface Desembolso {
  id: string;
  fecha: string | null;
  fecha_texto: string | null;
  estado: string;
  estado_texto: string;
  monto: number | null;
  referencia_pago: string | null;
  concepto: string | null;
}

export interface Otorgamiento {
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
  desembolsos: Desembolso[];
}

export interface Otorgamientos {
  otorgamientos: Otorgamiento[];
  pendiente_modulo: { seguimiento: boolean };
}

export interface Notificacion {
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
  creada_en_texto: string;
}

export interface ContadorNotificaciones {
  no_leidas: number;
  criticas_no_leidas: number;
}
