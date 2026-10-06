import { Router } from 'express';
import { IdParamSchema } from '@foest/shared';
import { authenticate, requirePermission, validate } from '../../shared';
import { hasSupabaseCredentials } from '../../config/env';
import { postulacionesController as c } from './postulaciones.controller';
import {
  CrearPostulacionDto,
  DesistirPostulacionDto,
  EnviarPostulacionDto,
  GuardarPostulacionDto,
  ListadoAdminQueryDto,
  ListadoPropioQueryDto,
} from './postulaciones.dto';
import { iniciarJobVencimientoSubsanacion } from './jobs/vencimiento-subsanacion.job';

/**
 * Rutas bajo /api/v1/postulaciones (docs/modules/postulaciones.md).
 * Cadena: authenticate() -> requirePermission() -> validate() -> controller.
 * El alcance por rol (FUNCIONARIO -> 403 en detalle; ADMINISTRADOR solo lectura)
 * se aplica en el servicio.
 */
export const postulacionesRoutes: Router = Router();

// Provisional: convocatorias abiertas con beneficios ofertados, para el asistente de nueva postulacion.
postulacionesRoutes.get('/convocatorias-abiertas', authenticate(), requirePermission('postulacion:crear'), c.convocatoriasAbiertas);

postulacionesRoutes.get('/me', authenticate(), requirePermission('postulacion:consultar'), validate({ query: ListadoPropioQueryDto }), c.listarPropias);

postulacionesRoutes.get('/', authenticate(), requirePermission('postulacion:consultar'), validate({ query: ListadoAdminQueryDto }), c.listarAdmin);

postulacionesRoutes.post('/', authenticate(), requirePermission('postulacion:crear'), validate({ body: CrearPostulacionDto }), c.crear);

postulacionesRoutes.get('/:id', authenticate(), requirePermission('postulacion:consultar'), validate({ params: IdParamSchema }), c.obtener);

postulacionesRoutes.put(
  '/:id',
  authenticate(),
  requirePermission('postulacion:editar'),
  validate({ params: IdParamSchema, body: GuardarPostulacionDto }),
  c.guardar,
);

postulacionesRoutes.delete('/:id', authenticate(), requirePermission('postulacion:eliminar_borrador'), validate({ params: IdParamSchema }), c.eliminar);

postulacionesRoutes.get('/:id/validacion', authenticate(), requirePermission('postulacion:consultar'), validate({ params: IdParamSchema }), c.validacion);

postulacionesRoutes.post(
  '/:id/enviar',
  authenticate(),
  requirePermission('postulacion:enviar'),
  validate({ params: IdParamSchema, body: EnviarPostulacionDto }),
  c.enviar,
);

postulacionesRoutes.post(
  '/:id/subsanar',
  authenticate(),
  requirePermission('postulacion:subsanar'),
  validate({ params: IdParamSchema, body: EnviarPostulacionDto }),
  c.subsanar,
);

postulacionesRoutes.post(
  '/:id/desistir',
  authenticate(),
  requirePermission('postulacion:desistir'),
  validate({ params: IdParamSchema, body: DesistirPostulacionDto }),
  c.desistir,
);

postulacionesRoutes.get('/:id/historial', authenticate(), requirePermission('postulacion:consultar'), validate({ params: IdParamSchema }), c.historial);

// Job de vencimiento de subsanacion (cada 15 min). No arranca en pruebas ni sin credenciales.
if (process.env.NODE_ENV !== 'test' && hasSupabaseCredentials()) {
  iniciarJobVencimientoSubsanacion();
}
