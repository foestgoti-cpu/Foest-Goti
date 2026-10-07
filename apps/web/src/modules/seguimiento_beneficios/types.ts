import type { AccionOtorgamiento, CodigoBeneficio, EstadoOtorgamiento } from '@foest/shared';

/** Tipos de UI del modulo; los DTOs de respuesta viven en @foest/shared. */
export interface FiltrosOtorgamientosUi {
  page: number;
  page_size?: number;
  convocatoria_id?: string;
  beneficio?: CodigoBeneficio | '';
  estado?: EstadoOtorgamiento | '';
  q?: string;
}

export type AccionEstado = Extract<AccionOtorgamiento, 'SUSPENDER' | 'REVOCAR' | 'REACTIVAR' | 'CUMPLIR'>;
