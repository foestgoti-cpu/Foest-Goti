import { z } from 'zod';
import { PaginacionQuerySchema } from '@foest/shared';

/** DTOs del modulo: esquemas Zod (reutilizan los de @foest/shared cuando existen). */
export const EjemploQueryDto = PaginacionQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
});
export type EjemploQuery = z.infer<typeof EjemploQueryDto>;
