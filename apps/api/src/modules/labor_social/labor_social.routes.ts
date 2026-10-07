import { Router } from 'express';
import { authenticate, requirePermission, validate } from '../../shared';
import { laborSocialController as c } from './labor_social.controller';
import {
  ActividadDto,
  ActividadParamsSchema,
  ActividadPatchDto,
  BeneficiarioLaborSocialParamsSchema,
  CertificadoParamsSchema,
  CompletarDto,
  CrearCertificadoDto,
  PresentarDto,
  ReabrirDto,
} from './labor_social.dto';

/**
 * Rutas del modulo labor_social (docs/modules/labor_social.md). Cadena: authenticate() -> requirePermission()
 * -> validate() -> controller. La propiedad del certificado (ajeno -> 404) y el alcance del funcionario
 * (asignacion activa) se resuelven en el servicio.
 *
 * Montaje (apps/api/src/modules/index.ts):
 *   /labor-social   -> laborSocialRoutes
 *   /beneficiarios  -> laborSocialBeneficiarioRoutes
 *
 * Sobre `/beneficiarios`: el router de accounts ya vive en ese prefijo y define `GET /:id` (un solo segmento).
 * `GET /:beneficiarioId/labor-social` tiene dos segmentos, por lo que no colisiona con `/:id`, `/:id/estado` ni
 * `/:id/documento` (esos son PATCH) ni con `/me/...` (el segmento `me` no es un uuid y la validacion lo rechazaria,
 * pero las rutas de accounts `/me/consentimientos`, `/me/datos` y `/me/habeas-data` se resuelven antes por orden de
 * registro). Se registra DESPUES de accounts: Express prueba los routers en orden y accounts no responde este camino.
 */
export const laborSocialRoutes: Router = Router();

// `/me` ANTES de `/:id`.
laborSocialRoutes.get('/me', authenticate(), requirePermission('labor_social:consultar'), c.misCertificados);
laborSocialRoutes.post('/', authenticate(), requirePermission('labor_social:registrar'), validate({ body: CrearCertificadoDto }), c.crear);

laborSocialRoutes.post(
  '/:id/actividades',
  authenticate(),
  requirePermission('labor_social:registrar'),
  validate({ params: CertificadoParamsSchema, body: ActividadDto }),
  c.agregarActividad,
);
laborSocialRoutes.patch(
  '/:id/actividades/:actividadId',
  authenticate(),
  requirePermission('labor_social:registrar'),
  validate({ params: ActividadParamsSchema, body: ActividadPatchDto }),
  c.editarActividad,
);
laborSocialRoutes.delete(
  '/:id/actividades/:actividadId',
  authenticate(),
  requirePermission('labor_social:registrar'),
  validate({ params: ActividadParamsSchema }),
  c.eliminarActividad,
);

laborSocialRoutes.patch('/:id/completar', authenticate(), requirePermission('labor_social:registrar'), validate({ params: CertificadoParamsSchema, body: CompletarDto }), c.completar);
laborSocialRoutes.patch('/:id/reabrir', authenticate(), requirePermission('labor_social:registrar'), validate({ params: CertificadoParamsSchema, body: ReabrirDto }), c.reabrir);
laborSocialRoutes.patch('/:id/presentar', authenticate(), requirePermission('labor_social:registrar'), validate({ params: CertificadoParamsSchema, body: PresentarDto }), c.presentar);

// Titular: genera borrador/definitivo. Funcionario con asignacion activa y administrador: ultima emision definitiva.
laborSocialRoutes.get('/:id/certificado.pdf', authenticate(), requirePermission('labor_social:consultar'), validate({ params: CertificadoParamsSchema }), c.certificadoPdf);

// --- /beneficiarios/:beneficiarioId/labor-social ---
export const laborSocialBeneficiarioRoutes: Router = Router();
laborSocialBeneficiarioRoutes.get(
  '/:beneficiarioId/labor-social',
  authenticate(),
  requirePermission('labor_social:consultar'),
  validate({ params: BeneficiarioLaborSocialParamsSchema }),
  c.porBeneficiario,
);
