import { Router } from 'express';
import { authenticate, requirePermission, validate } from '../../shared';
import { notificacionesController } from './notificaciones.controller';
import { NotificacionIdParamDto, NotificacionesQueryDto } from './beneficiario_dashboard.dto';

/**
 * Buzon in-app `/api/v1/notificaciones/*` para los tres roles (DECISIONES seccion 13).
 * Permisos: `notificacion:consultar` (lecturas) y `notificacion:marcar_leida` (escrituras).
 * `/leer-todas` se declara ANTES de `/:id/leida` para que no la capture el parametro.
 */
export const notificacionesRoutes: Router = Router();

notificacionesRoutes.get(
  '/me',
  authenticate(),
  requirePermission('notificacion:consultar'),
  validate({ query: NotificacionesQueryDto }),
  notificacionesController.listar,
);

notificacionesRoutes.get(
  '/me/no-leidas/contador',
  authenticate(),
  requirePermission('notificacion:consultar'),
  notificacionesController.contador,
);

notificacionesRoutes.patch(
  '/leer-todas',
  authenticate(),
  requirePermission('notificacion:marcar_leida'),
  notificacionesController.leerTodas,
);

notificacionesRoutes.patch(
  '/:id/leida',
  authenticate(),
  requirePermission('notificacion:marcar_leida'),
  validate({ params: NotificacionIdParamDto }),
  notificacionesController.marcarLeida,
);
