import { z } from 'zod';

export { UploadUrlSchema, ConfirmarDocumentoSchema, RequisitosQuerySchema } from '@foest/shared';

/** `GET /documentos/:id/url?version=n` (por defecto, la version vigente). */
export const UrlLecturaQuerySchema = z.object({
  version: z.coerce.number().int().positive().optional(),
});
export type UrlLecturaQuery = z.infer<typeof UrlLecturaQuerySchema>;
