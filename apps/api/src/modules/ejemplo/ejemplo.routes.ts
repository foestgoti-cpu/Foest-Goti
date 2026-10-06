import { Router } from 'express';
import { authenticate, requirePermission, validate } from '../../shared';
import { ejemploController } from './ejemplo.controller';
import { EjemploQueryDto } from './ejemplo.dto';

/**
 * Modulo de EJEMPLO: muestra la cadena completa
 *   authenticate() -> requirePermission() -> validate() -> controller
 * Los modulos reales siguen exactamente esta forma.
 */
export const ejemploRoutes: Router = Router();

// Ruta publica (sin authenticate): solo las de la lista cerrada de DECISIONES section 7.
ejemploRoutes.get('/publico', ejemploController.publico);

// Ruta autenticada con permiso de rol.
ejemploRoutes.get(
  '/',
  authenticate(),
  requirePermission('catalogo:consultar'),
  validate({ query: EjemploQueryDto }),
  ejemploController.listar,
);
