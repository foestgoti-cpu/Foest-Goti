import type { CodigoBeneficio } from '../enums';
import type { EstadoDesembolso, EstadoOtorgamiento, NivelAlertaCupo, TipoEventoOtorgamiento } from './seguimiento.enums';

/**
 * DTOs de RESPUESTA del modulo `seguimiento_beneficios`.
 * Ninguno contiene el numero de cuenta completo: solo `CuentaPagoEnmascaradaDto`.
 */

/** Cuenta de pago del subsidio de transporte, siempre enmascarada. */
export interface CuentaPagoEnmascaradaDto {
  tipo: string;
  entidad: string | null;
  /** Ejemplo: "•••• 1234". */
  numero_enmascarado: string;
}

export interface DesembolsoDto {
  id: string;
  otorgamiento_id: string;
  estado: EstadoDesembolso;
  monto: number;
  concepto: string | null;
  fecha_programada: string | null;
  fecha_pago: string | null;
  referencia_pago: string | null;
  motivo_anulacion: string | null;
  confirmar_excedente: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface EventoOtorgamientoDto {
  id: string;
  tipo: TipoEventoOtorgamiento;
  estado_anterior: EstadoOtorgamiento | null;
  estado_nuevo: EstadoOtorgamiento | null;
  motivo: string | null;
  actor_id: string | null;
  ocurrido_en: string;
}

/** Fila del listado administrativo. */
export interface OtorgamientoDto {
  id: string;
  postulacion_id: string;
  convocatoria_id: string;
  convocatoria_nombre: string | null;
  beneficiario_id: string;
  beneficiario_nombre: string | null;
  beneficiario_documento: string | null;
  beneficio_codigo: CodigoBeneficio;
  beneficio_nombre: string | null;
  estado: EstadoOtorgamiento;
  monto_aprobado: number;
  monto_desembolsado: number;
  monto_programado: number;
  excede_cupo: boolean;
  excede_presupuesto: boolean;
  version: number;
  otorgado_en: string;
  estado_cambiado_en: string | null;
}

export interface OtorgamientoDetalleDto extends OtorgamientoDto {
  cuenta_pago: CuentaPagoEnmascaradaDto | null;
  desembolsos: DesembolsoDto[];
  eventos: EventoOtorgamientoDto[];
}

/** Ocupacion de cupos y presupuesto de un (convocatoria, beneficio). */
export interface CupoBeneficioDto {
  convocatoria_id: string;
  convocatoria_nombre: string | null;
  beneficio_codigo: CodigoBeneficio;
  beneficio_nombre: string | null;
  cupos_estimados: number;
  cupos_ocupados: number;
  pct_cupos: number;
  presupuesto_asignado: number;
  presupuesto_comprometido: number;
  presupuesto_pagado: number;
  pct_presupuesto: number;
  /** Umbral de pre-alerta vigente (ALERTA_PRESUPUESTO_PORCENTAJE). */
  umbral_alerta_pct: number;
  alerta_cupos: NivelAlertaCupo;
  alerta_presupuesto: NivelAlertaCupo;
}

export interface MiDesembolsoDto {
  id: string;
  estado: EstadoDesembolso;
  monto: number;
  concepto: string | null;
  fecha_programada: string | null;
  fecha_pago: string | null;
  referencia_pago: string | null;
}

/** Vista del beneficiario: sin actores, motivos internos ni cuenta completa. */
export interface MiOtorgamientoDto {
  id: string;
  postulacion_id: string;
  convocatoria_nombre: string | null;
  beneficio_codigo: CodigoBeneficio;
  beneficio_nombre: string | null;
  estado: EstadoOtorgamiento;
  monto_aprobado: number;
  monto_desembolsado: number;
  otorgado_en: string;
  cuenta_pago: CuentaPagoEnmascaradaDto | null;
  desembolsos: MiDesembolsoDto[];
}

export interface FilaCargaPagosResultado {
  /** Numero de fila del archivo (la cabecera es la 1). */
  fila: number;
  ok: boolean;
  errores: string[];
  otorgamiento_id: string | null;
  desembolso_id: string | null;
  monto: number | null;
  fecha_pago: string | null;
  referencia: string | null;
}

export interface ResultadoCargaPagosDto {
  dry_run: boolean;
  /** `true` solo si la carga se aplico (todo o nada). */
  aplicada: boolean;
  carga_id: string | null;
  archivo_sha256: string;
  /** `true` si un archivo con el mismo SHA-256 ya fue aplicado (no puede aplicarse otra vez). */
  ya_aplicada: boolean;
  filas_total: number;
  filas_ok: number;
  filas_error: number;
  filas: FilaCargaPagosResultado[];
}

/** Resultado de registrar un pago: el numero de cuenta nunca se devuelve completo. */
export interface ResultadoPagoDto {
  desembolso: DesembolsoDto;
  cuenta_pago: CuentaPagoEnmascaradaDto | null;
}
