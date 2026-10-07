import { Router } from 'express';
import { IdParamSchema } from '@foest/shared';
import { authenticate, requirePermission, validate } from '../../shared';
import { requireExpedienteScope } from '../asignaciones';
import { evaluacionController as c } from './evaluacion.controller';
import { ChequeoDto, DictamenDto } from './evaluacion.dto';

/**
 * Rutas bajo /api/v1/evaluacion (docs/modules/evaluacion.md).
 *
 * Cadena: authenticate() -> requirePermission() -> validate(params) -> requireExpedienteScope() -> validate(body) -> controller.
 * El alcance se resuelve ANTES de validar el cuerpo para que un funcionario ajeno reciba 404 (no 422).
 *  - BENEFICIARIO: 403 (no tiene permisos evaluacion:*).
 *  - ADMINISTRADOR: solo lectura (evaluacion:consultar); 403 en chequeo y dictamen (no tiene revisar/dictaminar).
 *  - FUNCIONARIO: 404 si no es titular de la asignacion ACTIVA (escritura) o no la tuvo (lectura historica).
 * La bandeja, tomar, liberar y conflicto de interes viven en /asignaciones.
 */
export const evaluacionRoutes: Router = Router();

evaluacionRoutes.get(
  '/postulaciones/:id',
  authenticate(),
  requirePermission('evaluacion:consultar'),
  validate({ params: IdParamSchema }),
  requireExpedienteScope(),
  c.expediente,
);

evaluacionRoutes.put(
  '/postulaciones/:id/chequeo',
  authenticate(),
  requirePermission('evaluacion:revisar'),
  validate({ params: IdParamSchema }),
  requireExpedienteScope({ escritura: true }),
  validate({ body: ChequeoDto }),
  c.guardarChequeo,
);

evaluacionRoutes.post(
  '/postulaciones/:id/dictamen',
  authenticate(),
  requirePermission('evaluacion:dictaminar'),
  validate({ params: IdParamSchema }),
  requireExpedienteScope({ escritura: true }),
  validate({ body: DictamenDto }),
  c.dictaminar,
);

evaluacionRoutes.get(
  '/postulaciones/:id/historial-revisiones',
  authenticate(),
  requirePermission('evaluacion:consultar'),
  validate({ params: IdParamSchema }),
  requireExpedienteScope(),
  c.historial,
);
