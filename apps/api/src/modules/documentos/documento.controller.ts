import type { NextFunction, Request, Response } from 'express';
import type { ConfirmarDocumentoDto, RequisitosQueryDto, UploadUrlDto } from '@foest/shared';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import type { UrlLecturaQuery } from './documento.dto';
import { documentoService } from './documento.service';
import { requisitosService } from './requisitos.service';

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
export class DocumentoController {
  /** POST /postulaciones/:id/documentos/upload-url */
  uploadUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const r = await documentoService.solicitarSubida(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as UploadUrlDto);
      res.status(201).json(r);
    } catch (e) {
      next(e);
    }
  };

  /** POST /documentos/:id/confirmar */
  confirmarDocumento = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const r = await documentoService.confirmar(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as ConfirmarDocumentoDto);
      res.status(r.estado_carga === 'ESCANEANDO' ? 202 : 200).json(r);
    } catch (e) {
      next(e);
    }
  };

  /** GET /postulaciones/:id/documentos */
  getDocumentosPostulacion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const u = usuarioActual(req);
      res.json(await documentoService.listarPorPostulacion({ id: u.id, rol: u.rol }, req.params.id as string));
    } catch (e) {
      next(e);
    }
  };

  /** GET /documentos/:id */
  getDocumentoMetadata = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const u = usuarioActual(req);
      res.json(await documentoService.obtenerMetadatos({ id: u.id, rol: u.rol }, req.params.id as string));
    } catch (e) {
      next(e);
    }
  };

  /** GET /documentos/:id/url */
  getDocumentoUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const u = usuarioActual(req);
      const query = req.query as unknown as UrlLecturaQuery;
      res.json(await documentoService.generarUrlLectura(req.params.id as string, { id: u.id, rol: u.rol }, { ctx: contextoDesdeRequest(req), version: query.version }));
    } catch (e) {
      next(e);
    }
  };

  /** DELETE /documentos/:id */
  deleteDocumento = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await documentoService.eliminar(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  };

  /** GET /tipos-documento */
  getTiposDocumento = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ data: await requisitosService.listarTipos() });
    } catch (e) {
      next(e);
    }
  };

  /** GET /convocatorias/:id/requisitos-documentos */
  getRequisitosConvocatoria = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await requisitosService.requisitosDeConvocatoria(req.params.id as string, req.query as unknown as RequisitosQueryDto));
    } catch (e) {
      next(e);
    }
  };
}

export const documentoController = new DocumentoController();
