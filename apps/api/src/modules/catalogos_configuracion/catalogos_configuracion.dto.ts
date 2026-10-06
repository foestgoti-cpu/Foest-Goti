/**
 * DTOs del modulo: reexporta los esquemas Zod compartidos (@foest/shared) con los
 * nombres que usan las rutas. Los contratos de /configuracion y /festivos son los
 * mismos que usaba la implementacion minima de admin_dashboard.
 */
import { PaginacionQuerySchema } from '@foest/shared';

export {
  ConfiguracionListarQuerySchema as ConfiguracionListarQueryDto,
  ClaveParamSchema as ClaveParamDto,
  ConfiguracionActualizarSchema as ConfiguracionActualizarDto,
  FestivosQuerySchema as FestivosQueryDto,
  FestivoCrearSchema as FestivoCrearDto,
  FestivosCargaAnualSchema as FestivosCargaAnualDto,
  DiasHabilesQuerySchema as DiasHabilesQueryDto,
  FestivosPropuestaQuerySchema as FestivosPropuestaQueryDto,
  SniesBusquedaQuerySchema as SniesBusquedaQueryDto,
  CodigoSniesParamSchema as CodigoSniesParamDto,
  SniesImportarQuerySchema as SniesImportarQueryDto,
  SniesImportarBodySchema as SniesImportarBodyDto,
  CodigoDeclaracionParamSchema as CodigoDeclaracionParamDto,
  PublicarDeclaracionSchema as PublicarDeclaracionDto,
  PublicarConsentimientoSchema as PublicarConsentimientoDto,
} from '@foest/shared';

export type {
  ConfiguracionListarQuery,
  ConfiguracionActualizar,
  FestivosQuery,
  FestivoCrear,
  FestivosCargaAnual,
  DiasHabilesQuery,
  SniesBusquedaQuery,
  SniesImportarQuery,
  SniesImportarBody,
  PublicarDeclaracion,
  PublicarConsentimiento,
  PaginacionQuery,
} from '@foest/shared';

export const ImportacionesQueryDto = PaginacionQuerySchema;
