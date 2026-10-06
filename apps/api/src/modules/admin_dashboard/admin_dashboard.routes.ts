import { Router } from 'express';
import { IdParamSchema } from '@foest/shared';
import { authenticate, requirePermission, validate } from '../../shared';
import { adminDashboardController, auditoriaController, configuracionController, festivosController } from './admin_dashboard.controller';
import {
  AlertasQueryDto,
  AuditoriaEntidadParamsDto,
  AuditoriaListarQueryDto,
  CargaEvaluadoresQueryDto,
  ClaveParamDto,
  ConfiguracionActualizarDto,
  ConfiguracionListarQueryDto,
  FestivoCrearDto,
  FestivosQueryDto,
  MetricasPeriodoQueryDto,
} from './admin_dashboard.dto';

/**
 * Modulo admin_dashboard. Expone cuatro routers (registrados en src/modules/index.ts):
 *   /dashboard/admin  -> panel gerencial (permiso dashboard:admin, solo ADMINISTRADOR)
 *   /auditoria        -> consulta de bitacora (auditoria:consultar, solo ADMINISTRADOR)
 *   /configuracion    -> lectura/edicion de parametros (configuracion:consultar / configuracion:editar)
 *   /festivos         -> lectura (catalogo:consultar, todos) y escritura (catalogo:administrar, ADMINISTRADOR)
 * Los tres ultimos son los endpoints minimos de los modulos auditoria y
 * catalogos_configuracion, que no estan en este lote; se retiran cuando existan.
 */
export const adminDashboardRoutes: Router = Router();
adminDashboardRoutes.use(authenticate(), requirePermission('dashboard:admin'));
adminDashboardRoutes.get('/resumen', adminDashboardController.resumen);
adminDashboardRoutes.get('/alertas', validate({ query: AlertasQueryDto }), adminDashboardController.alertas);
adminDashboardRoutes.get('/convocatorias', adminDashboardController.convocatorias);
adminDashboardRoutes.get('/metricas/periodo', validate({ query: MetricasPeriodoQueryDto }), adminDashboardController.metricasPeriodo);
adminDashboardRoutes.get('/carga-evaluadores', validate({ query: CargaEvaluadoresQueryDto }), adminDashboardController.cargaEvaluadores);

export const auditoriaRoutes: Router = Router();
auditoriaRoutes.use(authenticate(), requirePermission('auditoria:consultar'));
auditoriaRoutes.get('/catalogo', auditoriaController.catalogo);
auditoriaRoutes.get('/', validate({ query: AuditoriaListarQueryDto }), auditoriaController.listar);
auditoriaRoutes.get('/entidad/:entidad/:id', validate({ params: AuditoriaEntidadParamsDto }), auditoriaController.porEntidad);
auditoriaRoutes.get('/:id', validate({ params: IdParamSchema }), auditoriaController.detalle);

export const configuracionRoutes: Router = Router();
configuracionRoutes.use(authenticate());
// Lectura y edicion de configuracion: exclusivas del administrador (configuracion:editar solo lo tiene ADMINISTRADOR).
configuracionRoutes.get('/', requirePermission('configuracion:consultar', 'configuracion:editar'), validate({ query: ConfiguracionListarQueryDto }), configuracionController.listar);
configuracionRoutes.get('/:clave', requirePermission('configuracion:consultar', 'configuracion:editar'), validate({ params: ClaveParamDto }), configuracionController.obtener);
configuracionRoutes.put('/:clave', requirePermission('configuracion:editar'), validate({ params: ClaveParamDto, body: ConfiguracionActualizarDto }), configuracionController.actualizar);

export const festivosRoutes: Router = Router();
festivosRoutes.use(authenticate());
festivosRoutes.get('/', requirePermission('catalogo:consultar'), validate({ query: FestivosQueryDto }), festivosController.listar);
festivosRoutes.post('/', requirePermission('catalogo:administrar'), validate({ body: FestivoCrearDto }), festivosController.crear);
festivosRoutes.delete('/:id', requirePermission('catalogo:administrar'), validate({ params: IdParamSchema }), festivosController.eliminar);
