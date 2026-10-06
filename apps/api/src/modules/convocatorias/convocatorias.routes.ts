import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { IdParamSchema } from '@foest/shared';
import { authenticate, requirePermission, validate } from '../../shared';
import { convocatoriasController, convocatoriasPublicoController } from './convocatorias.controller';
import {
  ActualizarConvocatoriaDto,
  AmpliarDto,
  ArchivarDto,
  ComiteDto,
  CrearConvocatoriaDto,
  DeshabilitarDto,
  ListarConvocatoriasQueryDto,
  VersionOpcionalDto,
} from './convocatorias.dto';
import { iniciarJobsConvocatorias } from './convocatorias.jobs';

/**
 * Rutas del modulo convocatorias. Se montan con tres prefijos en src/modules/index.ts:
 *   /convocatorias          -> convocatoriasRoutes (autenticado)
 *   /publico/convocatorias  -> convocatoriasPublicoRoutes (sin auth; DECISIONES section 7)
 *   /beneficios             -> beneficiosRoutes (catalogo, autenticado)
 */
export const convocatoriasRoutes: Router = Router();

convocatoriasRoutes.get(
  '/',
  authenticate(),
  requirePermission('convocatoria:consultar'),
  validate({ query: ListarConvocatoriasQueryDto }),
  convocatoriasController.listar,
);

convocatoriasRoutes.post(
  '/',
  authenticate(),
  requirePermission('convocatoria:crear'),
  validate({ body: CrearConvocatoriaDto }),
  convocatoriasController.crear,
);

convocatoriasRoutes.get(
  '/:id',
  authenticate(),
  requirePermission('convocatoria:consultar'),
  validate({ params: IdParamSchema }),
  convocatoriasController.obtener,
);

convocatoriasRoutes.put(
  '/:id',
  authenticate(),
  requirePermission('convocatoria:editar'),
  validate({ params: IdParamSchema, body: ActualizarConvocatoriaDto }),
  convocatoriasController.actualizar,
);

convocatoriasRoutes.patch(
  '/:id/habilitar',
  authenticate(),
  requirePermission('convocatoria:habilitar'),
  validate({ params: IdParamSchema, body: VersionOpcionalDto }),
  convocatoriasController.habilitar,
);

convocatoriasRoutes.patch(
  '/:id/deshabilitar',
  authenticate(),
  requirePermission('convocatoria:deshabilitar'),
  validate({ params: IdParamSchema, body: DeshabilitarDto }),
  convocatoriasController.deshabilitar,
);

convocatoriasRoutes.patch(
  '/:id/rehabilitar',
  authenticate(),
  requirePermission('convocatoria:rehabilitar'),
  validate({ params: IdParamSchema, body: VersionOpcionalDto }),
  convocatoriasController.rehabilitar,
);

convocatoriasRoutes.patch(
  '/:id/ampliar',
  authenticate(),
  requirePermission('convocatoria:ampliar'),
  validate({ params: IdParamSchema, body: AmpliarDto }),
  convocatoriasController.ampliar,
);

convocatoriasRoutes.patch(
  '/:id/archivar',
  authenticate(),
  requirePermission('convocatoria:archivar'),
  validate({ params: IdParamSchema, body: ArchivarDto }),
  convocatoriasController.archivar,
);

convocatoriasRoutes.get(
  '/:id/funcionarios',
  authenticate(),
  requirePermission('convocatoria:comite'),
  validate({ params: IdParamSchema }),
  convocatoriasController.listarComite,
);

convocatoriasRoutes.put(
  '/:id/funcionarios',
  authenticate(),
  requirePermission('convocatoria:comite'),
  validate({ params: IdParamSchema, body: ComiteDto }),
  convocatoriasController.definirComite,
);

/** Catalogo de beneficios (`GET /api/v1/beneficios`). */
export const beneficiosRoutes: Router = Router();
beneficiosRoutes.get('/', authenticate(), requirePermission('catalogo:consultar'), convocatoriasController.listarBeneficios);

/** Vista publica: solo HABILITADA vigentes, sin datos internos, con rate limit por IP y cache de 60 s. */
export const convocatoriasPublicoRoutes: Router = Router();
convocatoriasPublicoRoutes.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { code: 'DEMASIADAS_PETICIONES', message: 'Demasiadas peticiones; intente mas tarde' },
  }),
);
convocatoriasPublicoRoutes.get('/', convocatoriasPublicoController.listar);
convocatoriasPublicoRoutes.get('/:id', validate({ params: IdParamSchema }), convocatoriasPublicoController.obtener);

// Los jobs se registran al cargar el modulo (sin tocar server.ts). No arrancan en pruebas ni sin credenciales.
iniciarJobsConvocatorias();
