import type { CategoriaBeneficio, CodigoBeneficio, EstadoConvocatoria, EstadoPostulacion } from '@foest/shared';

/** Fila de `public.convocatoria`. Fechas como ISO (timestamptz). */
export interface ConvocatoriaRow {
  id: string;
  anio: number;
  semestre: number;
  nombre: string;
  descripcion: string;
  fecha_apertura: string;
  fecha_cierre_exclusiva: string;
  estado: EstadoConvocatoria;
  motivo_suspension: string | null;
  recordatorio_cierre_enviado_en: string | null;
  version: number;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface BeneficioRow {
  id: string;
  codigo: CodigoBeneficio;
  nombre: string;
  categoria: CategoriaBeneficio;
  descripcion: string;
  activo: boolean;
}

export interface ConvocatoriaBeneficioRow {
  convocatoria_id: string;
  beneficio_id: string;
  cupos_estimados: number;
  presupuesto_asignado: number;
  valor_apoyo_referencial: number;
  beneficio?: BeneficioRow | null;
}

export interface AmpliacionRow {
  id: string;
  convocatoria_id: string;
  tipo: 'PRORROGA' | 'REAPERTURA';
  fecha_cierre_anterior: string;
  fecha_cierre_nueva: string;
  estado_anterior: EstadoConvocatoria;
  admin_id: string | null;
  motivo: string;
  fecha_ampliacion: string;
}

export interface CambioEstadoRow {
  id: string;
  convocatoria_id: string;
  estado_desde: EstadoConvocatoria | null;
  estado_hasta: EstadoConvocatoria;
  origen: 'ADMIN' | 'CRON' | 'TIEMPO_REAL';
  actor_id: string | null;
  registrado_en: string;
}

export interface AsignacionFuncionarioRow {
  id: string;
  convocatoria_id: string;
  funcionario_id: string;
  asignado_en: string;
  asignado_por: string | null;
  retirado_en: string | null;
}

/** Beneficio ofertado tal como se presenta en las respuestas. */
export interface BeneficioOfertado {
  codigo: CodigoBeneficio;
  nombre: string;
  categoria: CategoriaBeneficio;
  descripcion: string;
  cupos_estimados: number;
  presupuesto_asignado: number;
  valor_apoyo_referencial: number;
}

/** Beneficio ofertado en la vista publica (sin presupuesto). */
export interface BeneficioPublico {
  codigo: CodigoBeneficio;
  nombre: string;
  categoria: CategoriaBeneficio;
  descripcion: string;
  cupos_estimados: number;
  valor_apoyo_referencial: number;
}

/** Campos calculados que acompanan a toda convocatoria en las respuestas. */
export interface CamposCalculados {
  /** `estado = HABILITADA AND fecha_apertura <= now < fecha_cierre_exclusiva`. */
  abierta: boolean;
  /** Fecha de cierre presentada (YYYY-MM-DD, ultimo dia habilitado hasta las 23:59:59). */
  fecha_cierre: string;
  /** Apertura presentada (YYYY-MM-DD en America/Bogota). */
  fecha_apertura_local: string;
  /** Dias naturales restantes hasta el cierre (0 si ya cerro). */
  dias_restantes: number;
}

export type ConteoPostulaciones = Partial<Record<EstadoPostulacion, number>>;

export interface ConvocatoriaResumen extends ConvocatoriaRow, CamposCalculados {
  beneficios: BeneficioOfertado[];
  postulaciones_total?: number;
}

export interface MiembroComite {
  funcionario_id: string;
  email: string;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  activo: boolean;
  asignado_en: string;
}

export interface ConvocatoriaDetalle extends ConvocatoriaResumen {
  ampliaciones: AmpliacionRow[];
  cambios_estado: CambioEstadoRow[];
  comite: MiembroComite[];
  postulaciones_por_estado: ConteoPostulaciones;
}

export interface ConvocatoriaPublica {
  id: string;
  nombre: string;
  anio: number;
  semestre: number;
  descripcion: string;
  fecha_apertura: string;
  fecha_cierre: string;
  /** Instante de cierre presentado como 23:59:59 locales (ISO). */
  fecha_cierre_presentada: string;
  dias_restantes: number;
  beneficios: BeneficioPublico[];
}

export interface ExpedienteAfectado {
  funcionario_id: string;
  postulacion_ids: string[];
}
