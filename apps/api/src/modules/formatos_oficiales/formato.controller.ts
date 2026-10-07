import type { NextFunction, Request, Response } from 'express';
import type { TipoFormato } from '@foest/shared';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { formatoService } from './formato.service';
import { verificarFormatoPublico } from './verificacion.service';

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
export class FormatoController {
  async generarFormato(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { http, formato } = await formatoService.generar(
        usuarioActual(req),
        contextoDesdeRequest(req),
        req.params.id as string,
        req.params.tipo as TipoFormato,
      );
      res.status(http).json(formato);
    } catch (error) {
      next(error);
    }
  }

  async getFormatosPostulacion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await formatoService.listar(usuarioActual(req), req.params.id as string));
    } catch (error) {
      next(error);
    }
  }

  async getFormatoMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await formatoService.obtener(usuarioActual(req), req.params.id as string));
    } catch (error) {
      next(error);
    }
  }

  async getFormatoUrlDescarga(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await formatoService.urlDescarga(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string));
    } catch (error) {
      next(error);
    }
  }

  async verificarFormatoPublico(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await verificarFormatoPublico(String(req.params.codigo ?? '')));
    } catch (error) {
      next(error);
    }
  }
}

export const formatoController = new FormatoController();
