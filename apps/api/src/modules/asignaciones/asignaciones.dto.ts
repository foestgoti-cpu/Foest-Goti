import {
  AlertasQuerySchema,
  BandejaQuerySchema,
  ConflictoInteresInputSchema,
  EvaluadoresQuerySchema,
  LiberarInputSchema,
  ReasignarInputSchema,
  ReasignarMasivoInputSchema,
  TomarInputSchema,
} from '@foest/shared';

/** Esquemas Zod de entrada del modulo (definidos en `@foest/shared/asignaciones`). */
export const TomarDto = TomarInputSchema;
export const LiberarDto = LiberarInputSchema;
export const ConflictoInteresDto = ConflictoInteresInputSchema;
export const ReasignarDto = ReasignarInputSchema;
export const ReasignarMasivoDto = ReasignarMasivoInputSchema;
export const BandejaQueryDto = BandejaQuerySchema;
export const AlertasQueryDto = AlertasQuerySchema;
export const EvaluadoresQueryDto = EvaluadoresQuerySchema;
