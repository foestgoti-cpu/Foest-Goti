import type { CodigoBeneficio, TipoSolicitud, VistaBandeja } from '@foest/shared';

/**
 * Tipos locales de UI del modulo asignaciones. Los DTO de respuesta y de entrada vienen de `@foest/shared`
 * (ResumenBandejaDto, AlertaAsignacionDto, EvaluadorCargaDto, HistorialAsignacionDto, ResultadoReasignacionMasivoDto).
 */

export interface FiltrosBandeja {
  page: number;
  vista?: VistaBandeja;
  tipo_solicitud?: TipoSolicitud;
  beneficio?: CodigoBeneficio;
}

export const TEXTO_MOTIVO_LIBERACION: Record<string, string> = {
  LIBERACION_VOLUNTARIA: 'Liberacion voluntaria',
  CONFLICTO_INTERES: 'Conflicto de interes',
  REASIGNACION: 'Reasignacion',
  DESHABILITACION: 'Deshabilitacion del funcionario',
  CAMBIO_COMITE: 'Cambio de comite',
  DICTAMEN_EMITIDO: 'Dictamen emitido',
  DESISTIMIENTO: 'Desistimiento',
};

export const TEXTO_EVENTO_HISTORIAL: Record<string, string> = {
  ASIGNADA: 'Asignacion',
  LIBERADA: 'Liberacion',
  CONFLICTO_INTERES: 'Conflicto de interes declarado',
};
