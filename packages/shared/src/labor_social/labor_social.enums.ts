import { z } from 'zod';

/**
 * Enums y constantes del modulo `labor_social` (docs/modules/labor_social.md).
 * `as const` + Zod (sin `enum` de TypeScript); el acceso `EstadoCertificado.EN_PROCESO` se conserva.
 */

export const ESTADOS_CERTIFICADO = ['EN_PROCESO', 'COMPLETADO', 'PRESENTADO'] as const;
export const EstadoCertificadoSchema = z.enum(ESTADOS_CERTIFICADO);
export type EstadoCertificado = z.infer<typeof EstadoCertificadoSchema>;
export const EstadoCertificado = {
  EN_PROCESO: 'EN_PROCESO',
  COMPLETADO: 'COMPLETADO',
  PRESENTADO: 'PRESENTADO',
} as const satisfies Record<EstadoCertificado, EstadoCertificado>;

export const TEXTO_ESTADO_CERTIFICADO: Readonly<Record<EstadoCertificado, string>> = {
  EN_PROCESO: 'En proceso',
  COMPLETADO: 'Completado',
  PRESENTADO: 'Presentado',
};

/** Claves de `configuracion_sistema` que usa el modulo. */
export const CLAVE_LABOR_SOCIAL_HORAS_MINIMAS = 'LABOR_SOCIAL_HORAS_MINIMAS';
export const CLAVE_LABOR_SOCIAL_HORAS_MAX_DIA = 'LABOR_SOCIAL_HORAS_MAX_DIA';

/** Tope diario por defecto (por confirmar con el Acuerdo 023); configurable con LABOR_SOCIAL_HORAS_MAX_DIA. */
export const LABOR_SOCIAL_HORAS_MAX_DIA = 8;
/** Techo absoluto de horas de una sola actividad (numeric(4,2) y un dia solo tiene 24 horas). */
export const LABOR_SOCIAL_HORAS_ACTIVIDAD_TECHO = 24;

export const LABOR_SOCIAL_DESCRIPCION_MIN = 10;
export const LABOR_SOCIAL_DESCRIPCION_MAX = 500;

/** Filas de actividades por pagina del GE-F038 y umbral de dependencias para la hoja de resumen. */
export const LABOR_SOCIAL_FILAS_POR_PAGINA = 15;
export const LABOR_SOCIAL_DEPENDENCIAS_PARA_RESUMEN = 4;

/** Formato oficial de la plantilla y tipo reportado por la verificacion publica. */
export const TIPO_FORMATO_LABOR_SOCIAL = 'GE-F038';
export const VERSION_PLANTILLA_LABOR_SOCIAL = 'GE-F038-v1';

/** Vigencia de la URL firmada de descarga del GE-F038 (segundos). */
export const LABOR_SOCIAL_SEGUNDOS_URL = 300;
