import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError, detallesZod } from './errors';

/**
 * Middleware de validacion Zod. Reemplaza `req.body` / `req.query` / `req.params`
 * por el valor parseado (con defaults y coerciones aplicadas). Datos invalidos -> 422.
 *
 * Uso:
 *   router.post('/', authenticate(), requirePermission('x:y'),
 *     validate({ body: CrearDto, params: IdParamSchema }), controller.crear);
 */
export interface EsquemasValidacion {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(esquemas: EsquemasValidacion): RequestHandler {
  return (req, _res, next) => {
    const partes: Array<keyof EsquemasValidacion> = ['params', 'query', 'body'];
    for (const parte of partes) {
      const esquema = esquemas[parte];
      if (!esquema) continue;
      const resultado = esquema.safeParse(req[parte]);
      if (!resultado.success) {
        return next(
          AppError.datosInvalidos('DATOS_INVALIDOS', `Datos invalidos en ${parte}`, detallesZod(resultado.error)),
        );
      }
      // Express 4 permite reasignar body/params; query se sobrescribe por defineProperty.
      if (parte === 'query') {
        Object.defineProperty(req, 'query', { value: resultado.data, writable: true, configurable: true });
      } else {
        (req as unknown as Record<string, unknown>)[parte] = resultado.data;
      }
    }
    return next();
  };
}

/** Tipado util para controladores: `Validado<typeof Dto>`. */
export type Validado<T extends ZodTypeAny> = z.infer<T>;
