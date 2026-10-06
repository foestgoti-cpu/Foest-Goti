/**
 * Tipos del modulo admin_dashboard (web). El catalogo de codigos de alerta debe
 * coincidir con apps/api/src/modules/admin_dashboard/admin_dashboard.types.ts;
 * la prueba de contrato comprueba que cada codigo tenga grupo y accion en el panel.
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

export type SeveridadAlerta = 'ALTA' | 'MEDIA' | 'BAJA';
export const SEVERIDADES: SeveridadAlerta[] = ['ALTA', 'MEDIA', 'BAJA'];
export const ETIQUETA_SEVERIDAD: Record<SeveridadAlerta, string> = { ALTA: 'Severidad alta', MEDIA: 'Severidad media', BAJA: 'Severidad baja' };

/** Grupo del panel y texto de la accion que resuelve cada alerta (tabla de admin_dashboard.md). */
export const CATALOGO_ALERTAS: Record<CodigoAlerta, { grupo: string; titulo: string; accion: string }> = {
  CIERRE_PROXIMO: { grupo: 'Convocatorias', titulo: 'Cierre proximo', accion: 'Ir a la convocatoria' },
  SIN_COMITE: { grupo: 'Convocatorias', titulo: 'Convocatoria sin comite', accion: 'Asignar comite' },
  SOBRECARGA: { grupo: 'Carga y comite', titulo: 'Evaluador con expedientes estancados', accion: 'Reasignar expedientes' },
  POOL_SIN_TOMAR: { grupo: 'Carga y comite', titulo: 'Postulaciones sin tomar', accion: 'Ver postulaciones pendientes' },
  SUBSANACION_POR_VENCER: { grupo: 'Plazos', titulo: 'Subsanacion por vencer', accion: 'Ver postulacion' },
  CUPOS_SUPERADOS: { grupo: 'Cupos y presupuesto', titulo: 'Cupos o presupuesto al limite', accion: 'Revisar convocatoria' },
  FUNCIONARIO_INACTIVO_CON_ASIGNACIONES: { grupo: 'Cuentas', titulo: 'Funcionario inactivo con expedientes', accion: 'Reasignacion masiva' },
  TRABAJO_FALLIDO: { grupo: 'Operacion', titulo: 'Trabajos fallidos', accion: 'Reintentar en el modulo propietario' },
};

export interface Alerta {
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
  alertas: Alerta[];
  detectores_con_error: Array<{ codigo: string; error: string }>;
  umbrales: Record<string, number>;
  desde_cache?: boolean;
}

export interface Resumen {
  generado_en: string;
  usuarios: Array<{ rol: string; activos: number; inactivos: number }>;
  convocatorias: Array<{ estado: string; total: number }>;
  postulaciones: Array<{ estado: string; total: number }>;
  festivos_anio_siguiente_cargados: boolean;
  montos: { estado: 'disponible' | 'pendiente_modulo'; monto_aprobado_total?: number; monto_desembolsado?: number; otorgamientos_vigentes?: number };
  desde_cache?: boolean;
}

export interface ConvocatoriaConsolidada {
  id: string;
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
  montos?: { estado: 'disponible' | 'pendiente_modulo'; monto_aprobado_total?: number; monto_desembolsado?: number; monto_aprobado_por_beneficio?: Record<string, number> };
}

export interface ComparativaPeriodos {
  kanon_umbral: number;
  a: MetricasPeriodo;
  b: MetricasPeriodo;
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

export interface RespuestaCarga {
  generado_en: string;
  periodo: string | null;
  evaluadores: CargaEvaluador[];
}
