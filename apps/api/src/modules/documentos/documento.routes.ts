import { Router } from 'express';
import { documentoController } from './documento.controller';
import { requireAuth } from '../../shared/middlewares/requireAuth';
// import { requireAlcance } from './ports/expediente-access.port'; // Conceptualmente

export const documentoRouter = Router();

documentoRouter.use(requireAuth);

documentoRouter.post('/postulaciones/:id/documentos/upload-url', documentoController.uploadUrl);
documentoRouter.post('/documentos/:id/confirmar', documentoController.confirmarDocumento);
documentoRouter.get('/postulaciones/:id/documentos', documentoController.getDocumentosPostulacion);
documentoRouter.get('/documentos/:id', documentoController.getDocumentoMetadata);
documentoRouter.get('/documentos/:id/url', documentoController.getDocumentoUrl);
documentoRouter.delete('/documentos/:id', documentoController.deleteDocumento);

// Catálogos
// documentoRouter.get('/tipos-documento', documentoController.getTiposDocumento);
documentoRouter.get('/convocatorias/:id/requisitos-documentos', documentoController.getRequisitosConvocatoria);

export default documentoRouter;

