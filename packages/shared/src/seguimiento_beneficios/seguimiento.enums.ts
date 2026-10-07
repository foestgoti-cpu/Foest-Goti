import { z } from 'zod';

/**
 * Enums del modulo `seguimiento_beneficios` (docs/modules/seguimiento_beneficios.md).
 * `as const` + Zod, mismo patron que `enums.ts` (sin `enum` de TypeScript).
 */

export const ESTADOS_OTORGAMIENTO = ['ACTIVO', 'SUSPENDIDO', 'REVOCADO', 'CUMPLIDO'] as const;
export const EstadoOtorgamientoSchema = z.enum(ESTADOS_OTORGAMIENTO);
export type EstadoOtorgamiento = z.infer<typeof EstadoOtorgamientoSchema>;
export const EstadoOtorgamiento = {
  ACTIVO: 'ACTIVO',
  SUSPENDIDO: 'SUSPENDIDO',
  REVOCADO: 'REVOCADO',
  CUMPLIDO: 'CUMPLIDO',
} as const satisfies Record<EstadoOtorgamiento, EstadoOtorgamiento>;

/** Estados terminales del otorgamiento (servicio + trigger de BD). */
export const ESTADOS_OTORGAMIENTO_TERMINALES: readonly EstadoOtorgamiento[] = ['REVOCADO', 'CUMPLIDO'];

/** Estados que ocupan cupo y comprometen presupuesto. */
export const ESTADOS_OTORGAMIENTO_COMPROMETEN: readonly EstadoOtorgamiento[] = ['ACTIVO', 'SUSPENDIDO', 'CUMPLIDO'];

/** Transiciones permitidas del otorgamiento (accion -> estados de origen y destino). */
export const TRANSICIONES_OTORGAMIENTO = {
  SUSPENDER: { desde: ['ACTIVO'], hacia: 'SUSPENDIDO' },
  REACTIVAR: { desde: ['SUSPENDIDO'], hacia: 'ACTIVO' },
  REVOCAR: { desde: ['ACTIVO', 'SUSPENDIDO'], hacia: 'REVOCADO' },
  CUMPLIR: { desde: ['ACTIVO'], hacia: 'CUMPLIDO' },
} as const satisfies Record<string, { desde: readonly EstadoOtorgamiento[]; hacia: EstadoOtorgamiento }>;
export type AccionOtorgamiento = keyof typeof TRANSICIONES_OTORGAMIENTO;

export const ESTADOS_DESEMBOLSO = ['PROGRAMADO', 'PAGADO', 'ANULADO'] as const;
export const EstadoDesembolsoSchema = z.enum(ESTADOS_DESEMBOLSO);
export type EstadoDesembolso = z.infer<typeof EstadoDesembolsoSchema>;
export const EstadoDesembolso = {
  PROGRAMADO: 'PROGRAMADO',
  PAGADO: 'PAGADO',
  ANULADO: 'ANULADO',
} as const satisfies Record<EstadoDesembolso, EstadoDesembolso>;

/** Tipos de evento del historial (`otorgamiento_evento.tipo`). */
export const TIPOS_EVENTO_OTORGAMIENTO = [
  'CREADO',
  'SUSPENDIDO',
  'REACTIVADO',
  'REVOCADO',
  'CUMPLIDO',
  'CUPO_EXCEDIDO',
  'PRESUPUESTO_EXCEDIDO',
  'DESEMBOLSO_PROGRAMADO',
  'DESEMBOLSO_PAGADO',
  'DESEMBOLSO_ANULADO',
] as const;
export const TipoEventoOtorgamientoSchema = z.enum(TIPOS_EVENTO_OTORGAMIENTO);
export type TipoEventoOtorgamiento = z.infer<typeof TipoEventoOtorgamientoSchema>;
export const TipoEventoOtorgamiento = {
  CREADO: 'CREADO',
  SUSPENDIDO: 'SUSPENDIDO',
  REACTIVADO: 'REACTIVADO',
  REVOCADO: 'REVOCADO',
  CUMPLIDO: 'CUMPLIDO',
  CUPO_EXCEDIDO: 'CUPO_EXCEDIDO',
  PRESUPUESTO_EXCEDIDO: 'PRESUPUESTO_EXCEDIDO',
  DESEMBOLSO_PROGRAMADO: 'DESEMBOLSO_PROGRAMADO',
  DESEMBOLSO_PAGADO: 'DESEMBOLSO_PAGADO',
  DESEMBOLSO_ANULADO: 'DESEMBOLSO_ANULADO',
} as const satisfies Record<TipoEventoOtorgamiento, TipoEventoOtorgamiento>;

/** Nivel de alerta de ocupacion de cupos/presupuesto de un (convocatoria, beneficio). */
export const NIVELES_ALERTA_CUPO = ['NORMAL', 'PREVENTIVA', 'EXCEDIDA'] as const;
export type NivelAlertaCupo = (typeof NIVELES_ALERTA_CUPO)[number];

/** Columnas del CSV de carga masiva de pagos (`otorgamiento_id`, o `postulacion_id` + `beneficio_codigo`, identifican el otorgamiento). */
export const COLUMNAS_CSV_PAGOS = ['otorgamiento_id', 'postulacion_id', 'beneficio_codigo', 'desembolso_id', 'monto', 'fecha_pago', 'referencia'] as const;
export type ColumnaCsvPagos = (typeof COLUMNAS_CSV_PAGOS)[number];

/** Columnas obligatorias del CSV. */
export const COLUMNAS_CSV_PAGOS_OBLIGATORIAS: readonly ColumnaCsvPagos[] = ['monto', 'fecha_pago', 'referencia'];

/** Tope de filas de una carga masiva. */
export const CARGA_PAGOS_MAX_FILAS = 2000;

/** Firma fija de lo que llega al beneficiario. */
export const FIRMA_SEGUIMIENTO = 'Equipo FOEST' as const;

/** Codigos de error de negocio del modulo (campo `code` de la respuesta). */
export const CODIGOS_ERROR_SEGUIMIENTO = [
  'OTORGAMIENTO_ESTADO_INVALIDO',
  'VERSION_CONFLICTO',
  'DESEMBOLSOS_PENDIENTES',
  'EXCEDE_PRESUPUESTO',
  'MONTO_EXCEDE_APROBADO',
  'CUENTA_PAGO_FALTANTE',
  'REFERENCIA_DUPLICADA',
  'DESEMBOLSO_ESTADO_INVALIDO',
  'FECHA_PROGRAMADA_INVALIDA',
  'CARGA_DUPLICADA',
  'CARGA_CON_ERRORES',
  'CSV_INVALIDO',
] as const;
export type CodigoErrorSeguimiento = (typeof CODIGOS_ERROR_SEGUIMIENTO)[number];
