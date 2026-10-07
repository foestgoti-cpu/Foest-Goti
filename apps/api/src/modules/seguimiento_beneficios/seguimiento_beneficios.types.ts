import type { CodigoBeneficio, EstadoDesembolso, EstadoOtorgamiento, TipoEventoOtorgamiento } from '@foest/shared';
import type { EventoAuditoria } from '../../shared';

/** Contexto de auditoria tomado de la peticion (contextoDesdeRequest). */
export type ContextoAuditoria = Pick<EventoAuditoria, 'ip' | 'user_agent' | 'request_id' | 'actor_id' | 'actor_rol' | 'actor_tipo'>;

export interface OtorgamientoRow {
  id: string;
  postulacion_id: string;
  convocatoria_id: string;
  beneficiario_id: string;
  beneficio_codigo: CodigoBeneficio;
  monto_aprobado: number | string;
  estado: EstadoOtorgamiento;
  cuenta_pago_id: string | null;
  revision_id: string | null;
  excede_cupo: boolean;
  excede_presupuesto: boolean;
  version: number;
  otorgado_en: string;
  estado_cambiado_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface DesembolsoRow {
  id: string;
  otorgamiento_id: string;
  estado: EstadoDesembolso;
  monto: number | string;
  concepto: string | null;
  fecha_programada: string | null;
  fecha_pago: string | null;
  referencia: string | null;
  motivo_anulacion: string | null;
  confirmar_excedente: boolean;
  motivo_excedente: string | null;
  registrado_por: string | null;
  carga_id: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface EventoRow {
  id: string;
  otorgamiento_id: string;
  tipo: TipoEventoOtorgamiento;
  estado_anterior: EstadoOtorgamiento | null;
  estado_nuevo: EstadoOtorgamiento | null;
  motivo: string | null;
  actor_id: string | null;
  ocurrido_en: string;
}

export interface CuentaPagoRow {
  id: string;
  beneficiario_id: string;
  postulacion_id: string;
  tipo: string;
  entidad: string | null;
  ultimos4: string | null;
}

/** Entrada de `crearOtorgamiento` (compatible con el puerto de evaluacion). */
export interface CrearOtorgamientoEntrada {
  postulacion_id: string;
  beneficio_codigo: CodigoBeneficio;
  convocatoria_id: string;
  monto_aprobado: number;
  revision_id?: string | null;
}

/** Decision por beneficio para `crearOtorgamientos(postulacionId, decisiones)`. */
export interface DecisionOtorgamiento {
  beneficio_codigo: CodigoBeneficio;
  monto_aprobado: number;
  revision_id?: string | null;
}

/** Montos de una convocatoria para los dashboards (solo lectura). */
export interface MontosBeneficio {
  beneficio_codigo: string;
  cupos_estimados: number;
  cupos_ocupados: number;
  presupuesto_asignado: number;
  /** Suma de monto_aprobado de todos los otorgamientos (cualquier estado). */
  monto_aprobado: number;
  /** ACTIVO + SUSPENDIDO + CUMPLIDO. */
  monto_comprometido: number;
  /** Desembolsos PAGADO. */
  monto_pagado: number;
}

export interface MontosConvocatoria {
  convocatoria_id: string;
  monto_aprobado: number;
  monto_comprometido: number;
  monto_pagado: number;
  por_beneficio: MontosBeneficio[];
  por_estado: Array<{ estado: EstadoOtorgamiento; beneficio_codigo: string; total: number; monto: number }>;
}
