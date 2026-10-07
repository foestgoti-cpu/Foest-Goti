import { Router } from 'express';
import { IdParamSchema } from '@foest/shared';
import { authenticate, requirePermission, validate } from '../../shared';
import { exportReportsController as c } from './export_reports.controller';
import { MisReportesQueryDto, SolicitarConsolidadoDto } from './export_reports.dto';
import { iniciarJobsReportes } from './export_reports.jobs';

/**
 * Rutas bajo /api/v1/reportes (docs/modules/export_reports.md). Unico mecanismo de exportacion.
 * Cadena: authenticate() -> requirePermission() -> validate() -> controller.
 *  - resumen.pdf: permiso postulacion:consultar (lo tienen los tres roles; el beneficiario descarga el suyo).
 *    El alcance se resuelve en el servicio: ajeno o sin asignacion -> 404.
 *  - consolidado: reportes:solicitar (BENEFICIARIO -> 403). Funcionario solo su comite (404 si no); administrador todas.
 *  - jobs, me, descarga: reportes:descargar; solo el solicitante (404 en ajenos).
 */
export const exportReportsRoutes: Router = Router();

exportReportsRoutes.get(
  '/postulaciones/:id/resumen.pdf',
  authenticate(),
  requirePermission('postulacion:consultar'),
  validate({ params: IdParamSchema }),
  c.resumenPdf,
);

exportReportsRoutes.post(
  '/convocatorias/:id/consolidado',
  authenticate(),
  requirePermission('reportes:solicitar'),
  validate({ params: IdParamSchema, body: SolicitarConsolidadoDto }),
  c.solicitarConsolidado,
);

exportReportsRoutes.get('/me', authenticate(), requirePermission('reportes:descargar'), validate({ query: MisReportesQueryDto }), c.misReportes);

exportReportsRoutes.get('/jobs/:id', authenticate(), requirePermission('reportes:descargar'), validate({ params: IdParamSchema }), c.obtenerJob);

exportReportsRoutes.get('/:id/descarga', authenticate(), requirePermission('reportes:descargar'), validate({ params: IdParamSchema }), c.descarga);

// Job de la cola de reportes (cada minuto) y purga. Inocuo sin credenciales y en pruebas.
iniciarJobsReportes();
