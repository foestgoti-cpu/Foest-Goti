import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { ConfirmarDocumentoSchema, IdParamSchema, RequisitosQuerySchema, UploadUrlSchema } from '@foest/shared';
import { authenticate, requirePermission, validate } from '../../shared';
import { documentoController as c } from './documento.controller';
import { UrlLecturaQuerySchema } from './documento.dto';
import { iniciarJobsDocumentos } from './documento.jobs';

/**
 * Rutas del modulo documentos (docs/modules/documentos.md). Se montan con cuatro prefijos en
 * src/modules/index.ts:
 *   /postulaciones  -> documentosPostulacionRoutes  (/:id/documentos, /:id/documentos/upload-url)
 *   /documentos     -> documentosRoutes             (/:id, /:id/confirmar, /:id/url)
 *   /tipos-documento-> tiposDocumentoRoutes
 *   /convocatorias  -> documentosConvocatoriaRoutes (/:id/requisitos-documentos)
 * Cadena: authenticate() -> requirePermission() -> validate() -> controller. El alcance por dueno,
 * funcionario con asignacion activa o administrador se resuelve en el servicio (ajeno -> 404).
 */

const mensajeLimite = { code: 'DEMASIADAS_PETICIONES', message: 'Demasiadas solicitudes de carga; intente nuevamente en unos minutos' };
const omitirEnPruebas = () => process.env.NODE_ENV === 'test';

// Limite por IP (clave por defecto, segura para IPv6) y por usuario autenticado.
const limitePorIp = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, message: mensajeLimite, skip: omitirEnPruebas });
const limitePorUsuario = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensajeLimite,
  skip: omitirEnPruebas,
  keyGenerator: (req: Request) => `u:${req.user?.id ?? 'anon'}`,
});

/** Prefijo /postulaciones: rutas /:id/documentos... (comparte prefijo con postulacionesRoutes). */
export const documentosPostulacionRoutes: Router = Router();

documentosPostulacionRoutes.post(
  '/:id/documentos/upload-url',
  limitePorIp,
  authenticate(),
  limitePorUsuario,
  requirePermission('documento:subir'),
  validate({ params: IdParamSchema, body: UploadUrlSchema }),
  c.uploadUrl,
);

documentosPostulacionRoutes.get(
  '/:id/documentos',
  authenticate(),
  requirePermission('documento:consultar'),
  validate({ params: IdParamSchema }),
  c.getDocumentosPostulacion,
);

/** Prefijo /documentos. */
export const documentosRoutes: Router = Router();

documentosRoutes.post(
  '/:id/confirmar',
  authenticate(),
  requirePermission('documento:subir'),
  validate({ params: IdParamSchema, body: ConfirmarDocumentoSchema }),
  c.confirmarDocumento,
);

documentosRoutes.get('/:id', authenticate(), requirePermission('documento:consultar'), validate({ params: IdParamSchema }), c.getDocumentoMetadata);

documentosRoutes.get(
  '/:id/url',
  authenticate(),
  requirePermission('documento:consultar'),
  validate({ params: IdParamSchema, query: UrlLecturaQuerySchema }),
  c.getDocumentoUrl,
);

documentosRoutes.delete('/:id', authenticate(), requirePermission('documento:eliminar'), validate({ params: IdParamSchema }), c.deleteDocumento);

/** Prefijo /tipos-documento: catalogo (documento:consultar la tienen los tres roles). */
export const tiposDocumentoRoutes: Router = Router();
tiposDocumentoRoutes.get('/', authenticate(), requirePermission('documento:consultar'), c.getTiposDocumento);

/** Prefijo /convocatorias: matriz de requisitos (la consume convocatorias.md). */
export const documentosConvocatoriaRoutes: Router = Router();
documentosConvocatoriaRoutes.get(
  '/:id/requisitos-documentos',
  authenticate(),
  requirePermission('documento:consultar'),
  validate({ params: IdParamSchema, query: RequisitosQuerySchema }),
  c.getRequisitosConvocatoria,
);

/** Compatibilidad con el esqueleto original (nombre usado por el companero). */
export const documentoRouter: Router = documentosRoutes;
export default documentosRoutes;

// Los jobs se registran al cargar el modulo. No arrancan en pruebas ni sin credenciales.
iniciarJobsDocumentos();
