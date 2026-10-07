import { Router } from 'express';
import { IdParamSchema } from '@foest/shared';
import { authenticate, requireAnyPermission, requirePermission, validate } from '../../shared';
import { asignacionesController as c } from './asignaciones.controller';
import {
  AlertasQueryDto,
  BandejaQueryDto,
  ConflictoInteresDto,
  EvaluadoresQueryDto,
  LiberarDto,
  ReasignarDto,
  ReasignarMasivoDto,
  TomarDto,
} from './asignaciones.dto';
import { iniciarJobsAsignaciones } from './asignaciones.jobs';

/**
 * Rutas bajo /api/v1/asignaciones (docs/modules/asignaciones.md).
 * Cadena: authenticate() -> requirePermission() -> validate() -> controller.
 * Un funcionario sin alcance sobre `:id` recibe 404 (nunca 403); el rol sin permiso recibe 403.
 */
export const asignacionesRoutes: Router = Router();

asignacionesRoutes.get('/bandeja', authenticate(), requirePermission('asignacion:bandeja'), validate({ query: BandejaQueryDto }), c.bandeja);

asignacionesRoutes.get('/alertas', authenticate(), requirePermission('asignacion:consultar'), validate({ query: AlertasQueryDto }), c.alertas);

asignacionesRoutes.get('/evaluadores', authenticate(), requirePermission('asignacion:reasignar'), validate({ query: EvaluadoresQueryDto }), c.evaluadores);

asignacionesRoutes.post(
  '/postulaciones/:id/tomar',
  authenticate(),
  requirePermission('asignacion:tomar'),
  validate({ params: IdParamSchema, body: TomarDto }),
  c.tomar,
);

asignacionesRoutes.post(
  '/postulaciones/:id/liberar',
  authenticate(),
  requirePermission('asignacion:liberar'),
  validate({ params: IdParamSchema, body: LiberarDto }),
  c.liberar,
);

asignacionesRoutes.post(
  '/postulaciones/:id/conflicto-interes',
  authenticate(),
  requirePermission('asignacion:conflicto_interes'),
  validate({ params: IdParamSchema, body: ConflictoInteresDto }),
  c.conflictoInteres,
);

asignacionesRoutes.post(
  '/postulaciones/:id/reasignar',
  authenticate(),
  requirePermission('asignacion:reasignar'),
  validate({ params: IdParamSchema, body: ReasignarDto }),
  c.reasignar,
);

asignacionesRoutes.post('/reasignar-masivo', authenticate(), requirePermission('asignacion:reasignar'), validate({ body: ReasignarMasivoDto }), c.reasignarMasivo);

// Administrador (asignacion:consultar) o titular (asignacion:bandeja); el servicio responde 404 a quien no tuvo la asignacion.
asignacionesRoutes.get(
  '/postulaciones/:id/historial',
  authenticate(),
  requireAnyPermission('asignacion:consultar', 'asignacion:bandeja'),
  validate({ params: IdParamSchema }),
  c.historial,
);

// El job diario arranca solo con credenciales y fuera de pruebas (patron de los demas modulos).
iniciarJobsAsignaciones();
