import { Router, type RequestHandler } from 'express';
import { IdParamSchema, type Rol } from '@foest/shared';
import { AppError, authenticate, requirePermission, usuarioActual, validate } from '../../shared';
import { seguimientoController as c } from './seguimiento_beneficios.controller';
import {
  AnularDesembolsoDto,
  CargaMasivaDto,
  CumplirDto,
  CuposQueryDto,
  FiltrosOtorgamientosDto,
  PagarDesembolsoDto,
  ProgramarDesembolsoDto,
  ReactivarDto,
  RevocarDto,
  SuspenderDto,
} from './seguimiento_beneficios.dto';
import { iniciarJobsSeguimiento } from './seguimiento_beneficios.jobs';

/**
 * Rutas bajo /api/v1/seguimiento (docs/modules/seguimiento_beneficios.md).
 * Cadena: authenticate() -> requirePermission() -> soloRol() -> validate() -> controller.
 *  - ADMINISTRADOR: todas las rutas administrativas.
 *  - FUNCIONARIO: 403 (no tiene permisos seguimiento:*).
 *  - BENEFICIARIO: solo /mis-otorgamientos (seguimiento:consultar es compartido con el administrador, por eso soloRol).
 */
export const seguimientoRoutes: Router = Router();

function soloRol(...roles: Rol[]): RequestHandler {
  return (req, _res, next) => {
    try {
      if (!roles.includes(usuarioActual(req).rol)) throw AppError.sinPermiso('ROL_NO_AUTORIZADO', 'Este recurso no esta disponible para su rol');
      next();
    } catch (e) {
      next(e);
    }
  };
}

const admin = soloRol('ADMINISTRADOR');

// ----- Beneficiario -----
seguimientoRoutes.get('/mis-otorgamientos', authenticate(), requirePermission('seguimiento:consultar'), soloRol('BENEFICIARIO'), c.misOtorgamientos);
seguimientoRoutes.get(
  '/mis-otorgamientos/:id',
  authenticate(),
  requirePermission('seguimiento:consultar'),
  soloRol('BENEFICIARIO'),
  validate({ params: IdParamSchema }),
  c.miOtorgamiento,
);

// ----- Administrador: consulta -----
seguimientoRoutes.get('/otorgamientos', authenticate(), requirePermission('seguimiento:consultar'), admin, validate({ query: FiltrosOtorgamientosDto }), c.listar);
seguimientoRoutes.get('/otorgamientos/:id', authenticate(), requirePermission('seguimiento:consultar'), admin, validate({ params: IdParamSchema }), c.detalle);
seguimientoRoutes.get('/cupos', authenticate(), requirePermission('seguimiento:consultar'), admin, validate({ query: CuposQueryDto }), c.cupos);

// ----- Administrador: cambios de estado del otorgamiento -----
seguimientoRoutes.patch(
  '/otorgamientos/:id/suspender',
  authenticate(),
  requirePermission('seguimiento:suspender'),
  admin,
  validate({ params: IdParamSchema, body: SuspenderDto }),
  c.suspender,
);
seguimientoRoutes.patch(
  '/otorgamientos/:id/revocar',
  authenticate(),
  requirePermission('seguimiento:revocar'),
  admin,
  validate({ params: IdParamSchema, body: RevocarDto }),
  c.revocar,
);
seguimientoRoutes.patch(
  '/otorgamientos/:id/reactivar',
  authenticate(),
  requirePermission('seguimiento:suspender'),
  admin,
  validate({ params: IdParamSchema, body: ReactivarDto }),
  c.reactivar,
);
seguimientoRoutes.patch(
  '/otorgamientos/:id/cumplir',
  authenticate(),
  requirePermission('seguimiento:desembolsar'),
  admin,
  validate({ params: IdParamSchema, body: CumplirDto }),
  c.cumplir,
);

// ----- Administrador: desembolsos -----
seguimientoRoutes.post(
  '/otorgamientos/:id/desembolsos',
  authenticate(),
  requirePermission('seguimiento:desembolsar'),
  admin,
  validate({ params: IdParamSchema, body: ProgramarDesembolsoDto }),
  c.programarDesembolso,
);
// La carga masiva se declara antes que /desembolsos/:id/* para que "carga-masiva" no se interprete como id.
seguimientoRoutes.post(
  '/desembolsos/carga-masiva',
  authenticate(),
  requirePermission('seguimiento:desembolsar'),
  admin,
  validate({ body: CargaMasivaDto }),
  c.cargaMasiva,
);
seguimientoRoutes.patch(
  '/desembolsos/:id/pagar',
  authenticate(),
  requirePermission('seguimiento:desembolsar'),
  admin,
  validate({ params: IdParamSchema, body: PagarDesembolsoDto }),
  c.pagarDesembolso,
);
seguimientoRoutes.patch(
  '/desembolsos/:id/anular',
  authenticate(),
  requirePermission('seguimiento:desembolsar'),
  admin,
  validate({ params: IdParamSchema, body: AnularDesembolsoDto }),
  c.anularDesembolso,
);

// Job diario de alertas de cupos/presupuesto: solo con credenciales y fuera de pruebas.
iniciarJobsSeguimiento();
