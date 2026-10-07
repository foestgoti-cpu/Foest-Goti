import { Request, Response, NextFunction } from 'express';
import { TipoFormato } from '@foest/shared';
// const formatoService = new FormatoService();

export class FormatoController {
  
  async generarFormato(req: Request, res: Response, next: NextFunction) {
    try {
      const { id, tipo } = req.params;
      // validaciones iniciales
      // let resultado = await formatoService.generar(id, tipo as TipoFormato);
      res.status(501).json({ error: 'Not implemented' });
    } catch (error) {
      next(error);
    }
  }

  async getFormatosPostulacion(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }

  async getFormatoMetadata(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }

  async getFormatoUrlDescarga(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }

  async verificarFormatoPublico(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }
}

export const formatoController = new FormatoController();

