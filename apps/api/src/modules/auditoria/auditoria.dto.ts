import {
  AuditoriaEntidadParamsSchema,
  AuditoriaExportarQuerySchema,
  AuditoriaListarQuerySchema,
  type AuditoriaEntidadParams,
  type AuditoriaExportarQuery,
  type AuditoriaListarQuery,
} from '@foest/shared';

/**
 * DTOs del modulo: reutilizan los esquemas compartidos de `@foest/shared/auditoria`
 * para que el web valide con las mismas reglas.
 */
export const AuditoriaListarQueryDto = AuditoriaListarQuerySchema;
export const AuditoriaEntidadParamsDto = AuditoriaEntidadParamsSchema;
export const AuditoriaExportarQueryDto = AuditoriaExportarQuerySchema;

export type { AuditoriaListarQuery, AuditoriaEntidadParams, AuditoriaExportarQuery };
