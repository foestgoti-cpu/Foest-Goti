import { Request, Response, NextFunction } from 'express';
import { requisitosService } from './requisitos.service';
import { TipoDocumento, EstadoCarga } from '@foest/shared';
// Se asume que el servicio principal (DocumentoService) existe
// const documentoService = new DocumentoService();

export class DocumentoController {
  
  async getRequisitosConvocatoria(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { beneficios, tipo_tramite } = req.query;
      
      if (beneficios && tipo_tramite) {
        const beneficiosArr = (beneficios as string).split(',');
        const result = await requisitosService.calcularExigibles(beneficiosArr, tipo_tramite as string);
        return res.json(result);
      }
      
      const requisitos = await requisitosService.getRequisitosByConvocatoria(id);
      return res.json(requisitos);
    } catch (error) {
      next(error);
    }
  }

  // Placeholder para los demás endpoints
  async uploadUrl(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }

  async confirmarDocumento(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }

  async getDocumentosPostulacion(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }

  async getDocumentoMetadata(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }

  async getDocumentoUrl(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }

  async deleteDocumento(req: Request, res: Response, next: NextFunction) {
    res.status(501).json({ error: 'Not implemented' });
  }
}

export const documentoController = new DocumentoController();

