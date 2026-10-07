import { z } from 'zod';

/** Tipos de formato oficial de la Alcaldia de Tocancipa (docs/modules/formatos_oficiales.md). */
export const TipoFormato = {
  GE_F041: 'GE-F041',
  GE_F043: 'GE-F043',
} as const;
export type TipoFormato = (typeof TipoFormato)[keyof typeof TipoFormato];
export const TIPOS_FORMATO = [TipoFormato.GE_F041, TipoFormato.GE_F043] as const;
export const TipoFormatoSchema = z.enum(TIPOS_FORMATO);

/** Estado del proceso de generacion del PDF. */
export const EstadoFormato = {
  GENERANDO: 'GENERANDO',
  LISTO: 'LISTO',
  FALLIDO: 'FALLIDO',
} as const;
export type EstadoFormato = (typeof EstadoFormato)[keyof typeof EstadoFormato];
export const ESTADOS_FORMATO = [EstadoFormato.GENERANDO, EstadoFormato.LISTO, EstadoFormato.FALLIDO] as const;
export const EstadoFormatoSchema = z.enum(ESTADOS_FORMATO);

/** Estado de un formato frente a los datos actuales de la postulacion. */
export const EstadoVigenciaFormato = {
  NO_GENERADO: 'NO_GENERADO',
  VIGENTE: 'VIGENTE',
  DESACTUALIZADO: 'DESACTUALIZADO',
} as const;
export type EstadoVigenciaFormato = (typeof EstadoVigenciaFormato)[keyof typeof EstadoVigenciaFormato];
