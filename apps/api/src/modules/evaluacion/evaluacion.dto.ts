import { ChequeoInputSchema, DictamenInputSchema } from '@foest/shared';

/**
 * Esquemas Zod de entrada del modulo (definidos en `@foest/shared` para que el web los reutilice).
 * PUT  /evaluacion/postulaciones/:id/chequeo -> ChequeoDto
 * POST /evaluacion/postulaciones/:id/dictamen -> DictamenDto
 */
export const ChequeoDto = ChequeoInputSchema;
export const DictamenDto = DictamenInputSchema;

export type { ChequeoInput, DictamenInput, DictamenBeneficioInput } from '@foest/shared';
