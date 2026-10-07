import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { GenerarFormatoParamsSchema, IdParamSchema } from '@foest/shared';
import { authenticate, requirePermission, validate } from '../../shared';
import { formatoController as c } from './formato.controller';

/**
 * Rutas del modulo formatos_oficiales (docs/modules/formatos_oficiales.md).
 * Cadena: authenticate() -> requirePermission() -> validate() -> controller.
 * El alcance (dueno / funcionario con asignacion o comite / administrador; ajeno -> 404)
 * se resuelve en el servicio.
 *
 * Montaje (apps/api/src/modules/index.ts):
 *   /formatos            -> formatosRoutes
 *   /postulaciones       -> formatosPostulacionRoutes
 *   /publico/verificar   -> formatosPublicoRoutes   (UNICA ruta publica del modulo)
 */

// --- /formatos ---
export const formatosRoutes: Router = Router();
formatosRoutes.get('/:id', authenticate(), requirePermission('postulacion:consultar'), validate({ params: IdParamSchema }), c.getFormatoMetadata);
formatosRoutes.get('/:id/descarga', authenticate(), requirePermission('postulacion:consultar'), validate({ params: IdParamSchema }), c.getFormatoUrlDescarga);

// --- /postulaciones/:id/formatos ---
export const formatosPostulacionRoutes: Router = Router();
formatosPostulacionRoutes.post(
  '/:id/formatos/:tipo/generar',
  authenticate(),
  requirePermission('formato:generar'),
  validate({ params: GenerarFormatoParamsSchema }),
  c.generarFormato,
);
formatosPostulacionRoutes.get('/:id/formatos', authenticate(), requirePermission('postulacion:consultar'), validate({ params: IdParamSchema }), c.getFormatosPostulacion);

// --- /publico/verificar (sin authenticate; rate limit propio por IP) ---
export const formatosPublicoRoutes: Router = Router();
formatosPublicoRoutes.use(
  rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { code: 'DEMASIADAS_PETICIONES', message: 'Demasiadas peticiones; intente más tarde' },
  }),
);
formatosPublicoRoutes.get('/:codigo', validate({ params: z.object({ codigo: z.string().min(1).max(128) }) }), c.verificarFormatoPublico);

/**
 * Compatibilidad con el esqueleto original (`formatoRouter`): agrupa los tres routers con sus
 * prefijos reales. El registro oficial monta cada uno por separado en modules/index.ts.
 */
export const formatoRouter: Router = Router();
formatoRouter.use('/formatos', formatosRoutes);
formatoRouter.use('/postulaciones', formatosPostulacionRoutes);
formatoRouter.use('/publico/verificar', formatosPublicoRoutes);

export default formatoRouter;
