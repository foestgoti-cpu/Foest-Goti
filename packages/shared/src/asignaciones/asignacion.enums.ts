import { z } from 'zod';

/** Estado de una asignacion por expediente (docs/modules/asignaciones.md). */
export const ESTADOS_ASIGNACION = ['ACTIVA', 'LIBERADA'] as const;
export const EstadoAsignacionSchema = z.enum(ESTADOS_ASIGNACION);
export type EstadoAsignacion = z.infer<typeof EstadoAsignacionSchema>;
export const EstadoAsignacion = {
  ACTIVA: 'ACTIVA',
  LIBERADA: 'LIBERADA',
} as const satisfies Record<EstadoAsignacion, EstadoAsignacion>;

/** Motivo por el que una asignacion pasa a LIBERADA. */
export const MOTIVOS_LIBERACION = [
  'LIBERACION_VOLUNTARIA',
  'CONFLICTO_INTERES',
  'REASIGNACION',
  'DESHABILITACION',
  'CAMBIO_COMITE',
  'DICTAMEN_EMITIDO',
  'DESISTIMIENTO',
] as const;
export const MotivoLiberacionSchema = z.enum(MOTIVOS_LIBERACION);
export type MotivoLiberacion = z.infer<typeof MotivoLiberacionSchema>;
export const MotivoLiberacion = {
  LIBERACION_VOLUNTARIA: 'LIBERACION_VOLUNTARIA',
  CONFLICTO_INTERES: 'CONFLICTO_INTERES',
  REASIGNACION: 'REASIGNACION',
  DESHABILITACION: 'DESHABILITACION',
  CAMBIO_COMITE: 'CAMBIO_COMITE',
  DICTAMEN_EMITIDO: 'DICTAMEN_EMITIDO',
  DESISTIMIENTO: 'DESISTIMIENTO',
} as const satisfies Record<MotivoLiberacion, MotivoLiberacion>;

/** Origen de una asignacion. */
export const ORIGENES_ASIGNACION = ['TOMA', 'REASIGNACION_ADMIN', 'REASIGNACION_MASIVA'] as const;
export const OrigenAsignacionSchema = z.enum(ORIGENES_ASIGNACION);
export type OrigenAsignacion = z.infer<typeof OrigenAsignacionSchema>;
export const OrigenAsignacion = {
  TOMA: 'TOMA',
  REASIGNACION_ADMIN: 'REASIGNACION_ADMIN',
  REASIGNACION_MASIVA: 'REASIGNACION_MASIVA',
} as const satisfies Record<OrigenAsignacion, OrigenAsignacion>;

/** Vista de la bandeja del funcionario. */
export const VISTAS_BANDEJA = ['TODAS', 'POOL', 'MIS_ASIGNACIONES'] as const;
export const VistaBandejaSchema = z.enum(VISTAS_BANDEJA);
export type VistaBandeja = z.infer<typeof VistaBandejaSchema>;
export const VistaBandeja = {
  TODAS: 'TODAS',
  POOL: 'POOL',
  MIS_ASIGNACIONES: 'MIS_ASIGNACIONES',
} as const satisfies Record<VistaBandeja, VistaBandeja>;

/** Alcance resuelto por el middleware `requireExpedienteScope`. */
export const ALCANCES_EXPEDIENTE = ['ESCRITURA', 'LECTURA_HISTORICA', 'LECTURA'] as const;
export const AlcanceExpedienteSchema = z.enum(ALCANCES_EXPEDIENTE);
export type AlcanceExpediente = z.infer<typeof AlcanceExpedienteSchema>;
export const AlcanceExpediente = {
  ESCRITURA: 'ESCRITURA',
  LECTURA_HISTORICA: 'LECTURA_HISTORICA',
  LECTURA: 'LECTURA',
} as const satisfies Record<AlcanceExpediente, AlcanceExpediente>;

/** Eventos del historial de asignaciones. */
export const EVENTOS_HISTORIAL_ASIGNACION = ['ASIGNADA', 'LIBERADA', 'CONFLICTO_INTERES'] as const;
export const EventoHistorialAsignacionSchema = z.enum(EVENTOS_HISTORIAL_ASIGNACION);
export type EventoHistorialAsignacion = z.infer<typeof EventoHistorialAsignacionSchema>;
export const EventoHistorialAsignacion = {
  ASIGNADA: 'ASIGNADA',
  LIBERADA: 'LIBERADA',
  CONFLICTO_INTERES: 'CONFLICTO_INTERES',
} as const satisfies Record<EventoHistorialAsignacion, EventoHistorialAsignacion>;
