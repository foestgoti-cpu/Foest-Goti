import { Router } from 'express';
import { IdParamSchema } from '@foest/shared';
import { authenticate, requirePermission, validate } from '../../shared';
import { auditoriaController } from './auditoria.controller';
import { AuditoriaEntidadParamsDto, AuditoriaExportarQueryDto, AuditoriaListarQueryDto } from './auditoria.dto';
import { iniciarJobsAuditoria } from './auditoria.jobs';

/**
 * Modulo auditoria: bitacora append-only (auditoria.md). Montado en /auditoria.
 * Solo lectura; no existen rutas de escritura, actualizacion ni borrado.
 *   GET /                      auditoria:consultar  consulta paginada con filtros
 *   GET /catalogo              auditoria:consultar  acciones, entidades y resultados validos
 *   GET /integridad            auditoria:consultar  estado de la cadena de hashes y de la cola
 *   GET /exportar              auditoria:exportar   CSV auditado (motivo obligatorio)
 *   GET /entidad/:entidad/:id  auditoria:consultar  linea de tiempo de una entidad
 *   GET /:id                   auditoria:consultar  detalle de un evento
 * Las rutas fijas van antes de `/:id`.
 */
export const auditoriaRoutes: Router = Router();
auditoriaRoutes.use(authenticate());
auditoriaRoutes.get('/catalogo', requirePermission('auditoria:consultar'), auditoriaController.catalogo);
auditoriaRoutes.get('/integridad', requirePermission('auditoria:consultar'), auditoriaController.integridad);
auditoriaRoutes.get('/exportar', requirePermission('auditoria:exportar'), validate({ query: AuditoriaExportarQueryDto }), auditoriaController.exportar);
auditoriaRoutes.get('/', requirePermission('auditoria:consultar'), validate({ query: AuditoriaListarQueryDto }), auditoriaController.listar);
auditoriaRoutes.get('/entidad/:entidad/:id', requirePermission('auditoria:consultar'), validate({ params: AuditoriaEntidadParamsDto }), auditoriaController.porEntidad);
auditoriaRoutes.get('/:id', requirePermission('auditoria:consultar'), validate({ params: IdParamSchema }), auditoriaController.detalle);

// Los jobs se registran al cargar el modulo (sin tocar server.ts). No arrancan en pruebas ni sin credenciales.
iniciarJobsAuditoria();
