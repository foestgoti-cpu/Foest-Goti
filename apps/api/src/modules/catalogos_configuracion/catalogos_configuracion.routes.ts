import express, { Router } from 'express';
import { IdParamSchema } from '@foest/shared';
import { AppError, authenticate, requirePermission, validate } from '../../shared';
import { hasSupabaseCredentials } from '../../config/env';
import { configuracionController, declaracionesController, festivosController, sniesController } from './catalogos_configuracion.controller';
import {
  ClaveParamDto,
  CodigoDeclaracionParamDto,
  CodigoSniesParamDto,
  ConfiguracionActualizarDto,
  ConfiguracionListarQueryDto,
  DiasHabilesQueryDto,
  FestivoCrearDto,
  FestivosCargaAnualDto,
  FestivosPropuestaQueryDto,
  FestivosQueryDto,
  ImportacionesQueryDto,
  PublicarConsentimientoDto,
  PublicarDeclaracionDto,
  SniesBusquedaQueryDto,
  SniesImportarQueryDto,
} from './catalogos_configuracion.dto';
import { iniciarJobsCatalogos } from './catalogos_configuracion.jobs';

/**
 * Modulo catalogos_configuracion. Expone cuatro routers (registrados en src/modules/index.ts):
 *   /configuracion    -> parametros del sistema (configuracion:consultar / configuracion:editar; /publica para todo autenticado)
 *   /festivos         -> lectura (catalogo:consultar) y escritura (catalogo:administrar); utilidad de dias habiles
 *   /catalogos        -> SNIES, declaraciones vigentes (catalogo:consultar) y consentimiento vigente (PUBLICA, sin token)
 *   /admin/catalogos  -> importacion SNIES, versionado de declaraciones y consentimiento (catalogo:administrar)
 * Contratos de /configuracion y /festivos identicos a la implementacion minima previa de admin_dashboard.
 */

// --- /configuracion --------------------------------------------------------------
export const configuracionRoutes: Router = Router();
configuracionRoutes.use(authenticate());
// Subconjunto no sensible para la UI de cualquier rol (antes de /:clave).
configuracionRoutes.get('/publica', configuracionController.publica);
configuracionRoutes.get('/', requirePermission('configuracion:consultar', 'configuracion:editar'), validate({ query: ConfiguracionListarQueryDto }), configuracionController.listar);
configuracionRoutes.get('/:clave', requirePermission('configuracion:consultar', 'configuracion:editar'), validate({ params: ClaveParamDto }), configuracionController.obtener);
configuracionRoutes.put('/:clave', requirePermission('configuracion:editar'), validate({ params: ClaveParamDto, body: ConfiguracionActualizarDto }), configuracionController.actualizar);

// --- /festivos -------------------------------------------------------------------
export const festivosRoutes: Router = Router();
festivosRoutes.use(authenticate());
festivosRoutes.get('/', requirePermission('catalogo:consultar'), validate({ query: FestivosQueryDto }), festivosController.listar);
festivosRoutes.get('/dias-habiles', requirePermission('catalogo:consultar'), validate({ query: DiasHabilesQueryDto }), festivosController.diasHabiles);
festivosRoutes.get('/propuesta', requirePermission('catalogo:administrar'), validate({ query: FestivosPropuestaQueryDto }), festivosController.propuesta);
festivosRoutes.post('/', requirePermission('catalogo:administrar'), validate({ body: FestivoCrearDto }), festivosController.crear);
festivosRoutes.post('/carga-anual', requirePermission('catalogo:administrar'), validate({ body: FestivosCargaAnualDto }), festivosController.cargaAnual);
festivosRoutes.delete('/:id', requirePermission('catalogo:administrar'), validate({ params: IdParamSchema }), festivosController.eliminar);

// --- /catalogos ------------------------------------------------------------------
export const catalogosRoutes: Router = Router();

/** Sin credenciales de Supabase la ruta publica responde 503 claro en vez de 500. */
const requireSupabase: express.RequestHandler = (_req, _res, next) => {
  if (!hasSupabaseCredentials()) {
    return next(new AppError(503, 'SIN_CREDENCIALES_SUPABASE', 'La API no tiene credenciales de Supabase configuradas'));
  }
  return next();
};
// PUBLICA (lista cerrada DECISIONES seccion 7): el registro necesita el texto antes de autenticarse.
catalogosRoutes.get('/consentimiento/vigente', requireSupabase, declaracionesController.consentimientoVigente);

catalogosRoutes.use(authenticate(), requirePermission('catalogo:consultar'));
catalogosRoutes.get('/ies', validate({ query: SniesBusquedaQueryDto }), sniesController.buscarIes);
catalogosRoutes.get('/ies/:codigo_snies/programas', validate({ params: CodigoSniesParamDto, query: SniesBusquedaQueryDto }), sniesController.programasDeIes);
catalogosRoutes.get('/programas/:codigo_snies', validate({ params: CodigoSniesParamDto }), sniesController.detallePrograma);
catalogosRoutes.get('/declaraciones/vigentes', declaracionesController.vigentes);

// --- /admin/catalogos ------------------------------------------------------------
export const catalogosAdminRoutes: Router = Router();
catalogosAdminRoutes.use(authenticate(), requirePermission('catalogo:administrar'));
catalogosAdminRoutes.post(
  '/snies/importar',
  express.text({ type: ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'], limit: '40mb' }),
  validate({ query: SniesImportarQueryDto }),
  sniesController.importar,
);
catalogosAdminRoutes.get('/snies/importaciones', validate({ query: ImportacionesQueryDto }), sniesController.importaciones);
catalogosAdminRoutes.get('/declaraciones', declaracionesController.todas);
catalogosAdminRoutes.post('/declaraciones/:codigo/versiones', validate({ params: CodigoDeclaracionParamDto, body: PublicarDeclaracionDto }), declaracionesController.publicar);
catalogosAdminRoutes.get('/consentimiento/versiones', declaracionesController.versionesConsentimiento);
catalogosAdminRoutes.post('/consentimiento/versiones', validate({ body: PublicarConsentimientoDto }), declaracionesController.publicarConsentimiento);

// Jobs: alerta de festivos del anio siguiente (arranque y diario en diciembre). No arrancan en pruebas ni sin credenciales.
iniciarJobsCatalogos();
