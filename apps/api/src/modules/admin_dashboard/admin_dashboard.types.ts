/**
 * Tipos internos del modulo admin_dashboard (+ endpoints minimos de auditoria,
 * configuracion y festivos implementados aqui mientras esos modulos no existen).
 *
 * El catalogo de codigos de alerta debe coincidir con
 * apps/web/src/modules/admin_dashboard/types.ts (prueba de contrato en el web).
 */

export const CODIGOS_ALERTA = [
  'CIERRE_PROXIMO',
  'SIN_COMITE',
  'SOBRECARGA',
  'POOL_SIN_TOMAR',
  'SUBSANACION_POR_VENCER',
  'CUPOS_SUPERADOS',
  'FUNCIONARIO_INACTIVO_CON_ASIGNACIONES',
  'TRABAJO_FALLIDO',
] as const;
export type CodigoAlerta = (typeof CODIGOS_ALERTA)[number];

export const SEVERIDADES_ALERTA = ['ALTA', 'MEDIA', 'BAJA'] as const;
export type SeveridadAlerta = (typeof SEVERIDADES_ALERTA)[number];

export interface AlertaDto {
  codigo: CodigoAlerta;
  severidad: SeveridadAlerta;
  entidad: string;
  entidad_id: string | null;
  mensaje: string;
  detalle: Record<string, unknown>;
  accion_url: string;
}

export interface RespuestaAlertas {
  generado_en: string;
  total: number;
  alertas: AlertaDto[];
  detectores_con_error: Array<{ codigo: string; error: string }>;
  umbrales: Record<string, number>;
  desde_cache?: boolean;
}

export interface ResumenAdmin {
  generado_en: string;
  usuarios: Array<{ rol: string; activos: number; inactivos: number }>;
  convocatorias: Array<{ estado: string; total: number }>;
  postulaciones: Array<{ estado: string; total: number }>;
  festivos_anio_siguiente_cargados: boolean;
  montos: { estado: 'disponible' | 'pendiente_modulo'; [k: string]: unknown };
  desde_cache?: boolean;
}

export interface ConvocatoriaConsolidada {
  id: string;
  anio: number;
  semestre: number;
  periodo: string;
  nombre: string;
  estado: string;
  fecha_apertura: string;
  fecha_cierre_exclusiva: string;
  comite: Array<{ funcionario_id: string; nombre: string; activo: boolean }>;
  postulaciones_por_estado: Record<string, number>;
  total_enviadas: number;
  total_resueltas: number;
  cupos_estimados: number;
  presupuesto_asignado: number;
  ocupacion: { estado: 'disponible' | 'pendiente_modulo'; otorgamientos?: number; monto_aprobado?: number };
  /** Calculado por la API: resueltas / enviadas * 100 (0 si no hay enviadas). */
  avance_pct: number;
}

export interface MetricasPeriodo {
  periodo: string;
  existe: boolean;
  convocatoria?: { id: string; nombre: string; estado: string };
  postulaciones_por_estado?: Record<string, number>;
  postulaciones_por_tipo?: Record<string, number>;
  postulaciones_por_beneficio?: Record<string, number>;
  total_enviadas?: number;
  aprobaciones_totales?: number;
  aprobaciones_parciales?: number;
  montos?: { estado: 'disponible' | 'pendiente_modulo'; [k: string]: unknown };
}

export interface CargaEvaluador {
  funcionario_id: string;
  nombre: string;
  activo: boolean;
  en_evaluacion: number;
  dictaminadas_periodo: number;
  pendientes_pool_del_comite: number;
  comites_activos: number;
}

/** Fila de configuracion_sistema tal como se expone al administrador. */
export interface ConfiguracionItem {
  clave: string;
  valor: string | null;
  tipo: 'INT' | 'STRING' | 'BOOL' | 'TEXT' | 'DATE' | 'JSON';
  categoria: string;
  descripcion: string;
  valor_defecto: string | null;
  valor_min: string | null;
  valor_max: string | null;
  pendiente_confirmar: boolean;
  version: number;
  actualizado_por: string | null;
  actualizado_en: string;
}

export interface FestivoItem {
  id: string;
  fecha: string;
  nombre: string;
  anio: number;
  creado_por: string | null;
  creado_en: string;
}

export interface AuditoriaEventoItem {
  id: string;
  secuencia: number;
  actor_id: string | null;
  actor_tipo: string;
  actor_rol: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  resultado: string;
  datos_antes: unknown;
  datos_despues: unknown;
  metadatos: Record<string, unknown>;
  request_id: string | null;
  sesion_id: string | null;
  ip_origen: string | null;
  user_agent: string | null;
  hash_previo: string | null;
  hash_evento: string | null;
  registrado_en: string;
}

/** Catalogo cerrado (auditoria.md) para los filtros del visor. */
export const ACCIONES_AUDITORIA = [
  'CREAR', 'ACTUALIZAR', 'ELIMINAR', 'DESHABILITAR', 'REHABILITAR', 'HABILITAR', 'AMPLIAR', 'ARCHIVAR',
  'ENVIAR', 'SUBSANAR', 'DESISTIR', 'TOMAR', 'LIBERAR', 'CONFLICTO_INTERES', 'REASIGNAR', 'DICTAMINAR',
  'TRANSICION_ESTADO', 'SUSPENDER', 'REVOCAR', 'DESEMBOLSAR', 'LOGIN', 'LOGIN_FALLIDO', 'LOGOUT',
  'REFRESH_REUSO', 'CAMBIO_CLAVE', 'INVITACION_EMITIDA', 'INVITACION_ACEPTADA', 'REVOCAR_SESIONES',
  'LECTURA_SENSIBLE', 'DESCARGA_DOCUMENTO', 'GENERAR_FORMATO', 'EXPORTACION', 'CONFIGURACION', 'ACCESO_DENEGADO',
] as const;

export const ENTIDADES_AUDITORIA = [
  'USUARIO', 'SESION', 'INVITACION', 'BENEFICIARIO', 'FUNCIONARIO', 'ROL_PERMISO', 'CONSENTIMIENTO_DATOS',
  'CONVOCATORIA', 'CONVOCATORIA_BENEFICIO', 'AMPLIACION_CONVOCATORIA', 'ASIGNACION_FUNCIONARIO', 'ASIGNACION',
  'POSTULACION', 'POSTULACION_ENVIO', 'DOCUMENTO', 'FORMATO_GENERADO', 'REVISION', 'REVISION_BENEFICIO',
  'REVISION_DOCUMENTO', 'OTORGAMIENTO', 'DESEMBOLSO', 'CERTIFICADO_LABOR_SOCIAL', 'REPORTE', 'NOTIFICACION',
  'CONFIGURACION', 'FESTIVO', 'CATALOGO_SNIES', 'DECLARACION_JURAMENTADA', 'TEXTO_CONSENTIMIENTO', 'AUDITORIA',
] as const;
