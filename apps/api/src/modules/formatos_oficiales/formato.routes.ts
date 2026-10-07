import { Router } from 'express';
import { formatoController } from './formato.controller';
import { requireAuth } from '../../shared/middlewares/requireAuth';

export const formatoRouter = Router();

// Pública
formatoRouter.get('/publico/verificar/:codigo', formatoController.verificarFormatoPublico);

// Privadas
formatoRouter.use(requireAuth);

formatoRouter.post('/postulaciones/:id/formatos/:tipo/generar', formatoController.generarFormato);
formatoRouter.get('/postulaciones/:id/formatos', formatoController.getFormatosPostulacion);
formatoRouter.get('/formatos/:id', formatoController.getFormatoMetadata);
formatoRouter.get('/formatos/:id/descarga', formatoController.getFormatoUrlDescarga);

export default formatoRouter;

