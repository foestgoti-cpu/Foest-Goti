import { Router } from 'express';
import { authenticate, requirePermission, validate } from '../../shared';
import { beneficiarioDashboardController } from './beneficiario_dashboard.controller';
import { PostulacionIdParamDto } from './beneficiario_dashboard.dto';

/**
 * Portal del beneficiario: `/api/v1/dashboard/beneficiario/*`.
 * Todas las rutas exigen sesion y el permiso `dashboard:beneficiario`
 * (solo el rol BENEFICIARIO lo tiene: ADMINISTRADOR y FUNCIONARIO reciben 403).
 * El alcance (postulacion ajena -> 404) lo verifica el servicio ademas de RLS.
 */
export const beneficiarioDashboardRoutes: Router = Router();

beneficiarioDashboardRoutes.use(authenticate(), requirePermission('dashboard:beneficiario'));

beneficiarioDashboardRoutes.get('/resumen', beneficiarioDashboardController.resumen);

beneficiarioDashboardRoutes.get(
  '/postulaciones/:id/linea-tiempo',
  validate({ params: PostulacionIdParamDto }),
  beneficiarioDashboardController.lineaTiempo,
);

beneficiarioDashboardRoutes.get(
  '/postulaciones/:id/documentos',
  validate({ params: PostulacionIdParamDto }),
  beneficiarioDashboardController.documentos,
);

beneficiarioDashboardRoutes.get('/descargas', beneficiarioDashboardController.descargas);

beneficiarioDashboardRoutes.get('/otorgamientos', beneficiarioDashboardController.otorgamientos);
