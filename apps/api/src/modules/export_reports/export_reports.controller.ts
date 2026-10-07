import type { NextFunction, Request, Response } from 'express';
import type { MisReportesQuery, SolicitarConsolidadoInput } from '@foest/shared';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { exportReportsService } from './export_reports.service';
import { resumenService } from './resumen.service';

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
export class ExportReportsController {
  async resumenPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pdf, nombre } = await resumenService.generar(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(pdf);
    } catch (error) {
      next(error);
    }
  }

  async solicitarConsolidado(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { http, respuesta } = await exportReportsService.solicitarConsolidado(
        usuarioActual(req),
        contextoDesdeRequest(req),
        req.params.id as string,
        req.body as SolicitarConsolidadoInput,
      );
      res.status(http).json(respuesta);
    } catch (error) {
      next(error);
    }
  }

  async obtenerJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await exportReportsService.obtener(usuarioActual(req), req.params.id as string));
    } catch (error) {
      next(error);
    }
  }

  async misReportes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await exportReportsService.listarMios(usuarioActual(req), req.query as unknown as MisReportesQuery));
    } catch (error) {
      next(error);
    }
  }

  async descarga(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await exportReportsService.descarga(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string));
    } catch (error) {
      next(error);
    }
  }
}

export const exportReportsController = new ExportReportsController();
