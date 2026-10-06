import { z } from 'zod';
import { RolSchema, UuidSchema } from '@foest/shared';

/**
 * `:id` de un rol: su nombre (clave natural de los roles base inmutables) o el
 * uuid de `public.rol` (se resuelve contra la base cuando hay credenciales).
 */
export const RolIdParamSchema = z.object({
  id: z.union([RolSchema, UuidSchema]),
});
export type RolIdParam = z.infer<typeof RolIdParamSchema>;
