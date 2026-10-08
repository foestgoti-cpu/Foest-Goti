import { Router, type RequestHandler } from 'express';
import { IdParamSchema, PaginacionQuerySchema, type Rol } from '@foest/shared';
import { AppError, authenticate, requireAnyPermission, requirePermission, validate } from '../../shared';
import { administradoresController, beneficiariosController, funcionariosController, habeasDataController } from './accounts.controller';
import {
  ActualizarFuncionarioDto,
  CambiarEstadoCuentaDto,
  CorregirDocumentoDto,
  CrearFuncionarioDto,
  ListarBeneficiariosQueryDto,
  ListarFuncionariosQueryDto,
  ListarHabeasDataQueryDto,
  PerfilBeneficiarioDto,
  RestablecerClaveDto,
  ResolverHabeasDataDto,
  SolicitudHabeasDataDto,
} from './accounts.dto';

/**
 * Modulo accounts (docs/modules/accounts.md). Cuatro routers:
 *   /funcionarios, /administradores, /beneficiarios, /habeas-data
 * Cadena: authenticate() -> requirePermission() -> validate() -> controller.
 */

/** 403 si el rol no esta en la lista (para rutas cuyo permiso es compartido pero el alcance es solo admin). */
function soloRoles(...roles: Rol[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.noAutenticado());
    if (!roles.includes(req.user.rol)) return next(AppError.sinPermiso());
    return next();
  };
}

// --- /funcionarios ---
export const funcionariosRoutes: Router = Router();
funcionariosRoutes.get('/', authenticate(), requirePermission('funcionario:consultar'), validate({ query: ListarFuncionariosQueryDto }), funcionariosController.listar);
funcionariosRoutes.get('/dependencias', authenticate(), requirePermission('funcionario:consultar'), funcionariosController.dependencias);
funcionariosRoutes.post('/', authenticate(), requirePermission('funcionario:crear'), validate({ body: CrearFuncionarioDto }), funcionariosController.invitar);
funcionariosRoutes.get('/:id', authenticate(), requirePermission('funcionario:consultar'), validate({ params: IdParamSchema }), funcionariosController.detalle);
funcionariosRoutes.patch('/:id', authenticate(), requirePermission('funcionario:editar'), validate({ params: IdParamSchema, body: ActualizarFuncionarioDto }), funcionariosController.actualizar);
funcionariosRoutes.patch('/:id/estado', authenticate(), requirePermission('funcionario:estado'), validate({ params: IdParamSchema, body: CambiarEstadoCuentaDto }), funcionariosController.cambiarEstado);
funcionariosRoutes.post('/:id/invitacion/reenviar', authenticate(), requirePermission('funcionario:crear'), validate({ params: IdParamSchema }), funcionariosController.reenviarInvitacion);
funcionariosRoutes.post('/:id/restablecer-clave', authenticate(), requirePermission('funcionario:restablecer_clave'), validate({ params: IdParamSchema, body: RestablecerClaveDto }), funcionariosController.restablecerClave);

// --- /administradores ---
export const administradoresRoutes: Router = Router();
administradoresRoutes.get('/', authenticate(), requirePermission('administrador:consultar'), validate({ query: PaginacionQuerySchema }), administradoresController.listar);
administradoresRoutes.patch('/:id/estado', authenticate(), requirePermission('administrador:estado'), validate({ params: IdParamSchema, body: CambiarEstadoCuentaDto }), administradoresController.cambiarEstado);

// --- /beneficiarios ---
export const beneficiariosRoutes: Router = Router();
// Titular (/me) - antes de /:id
beneficiariosRoutes.get('/me', authenticate(), requirePermission('beneficiario:editar_perfil'), beneficiariosController.perfilPropio);
beneficiariosRoutes.put('/me', authenticate(), requirePermission('beneficiario:editar_perfil'), validate({ body: PerfilBeneficiarioDto }), beneficiariosController.actualizarPerfilPropio);
beneficiariosRoutes.get('/me/consentimientos', authenticate(), requirePermission('beneficiario:editar_perfil'), beneficiariosController.consentimientosPropios);
beneficiariosRoutes.post('/me/consentimientos', authenticate(), requirePermission('beneficiario:editar_perfil'), beneficiariosController.aceptarConsentimiento);
beneficiariosRoutes.get('/me/datos', authenticate(), requirePermission('habeas_data:solicitar'), beneficiariosController.exportarDatosPropios);
beneficiariosRoutes.get('/me/habeas-data', authenticate(), requirePermission('habeas_data:solicitar'), beneficiariosController.habeasDataPropias);
beneficiariosRoutes.post('/me/habeas-data', authenticate(), requirePermission('habeas_data:solicitar'), validate({ body: SolicitudHabeasDataDto }), beneficiariosController.radicarHabeasData);
// Administrador / funcionario con alcance
beneficiariosRoutes.get('/', authenticate(), requirePermission('beneficiario:consultar'), soloRoles('ADMINISTRADOR'), validate({ query: ListarBeneficiariosQueryDto }), beneficiariosController.listar);
beneficiariosRoutes.get('/:id', authenticate(), requirePermission('beneficiario:consultar'), validate({ params: IdParamSchema }), beneficiariosController.detalle);
beneficiariosRoutes.patch('/:id/estado', authenticate(), requirePermission('beneficiario:estado'), validate({ params: IdParamSchema, body: CambiarEstadoCuentaDto }), beneficiariosController.cambiarEstado);
beneficiariosRoutes.patch('/:id/documento', authenticate(), requirePermission('beneficiario:corregir_documento'), validate({ params: IdParamSchema, body: CorregirDocumentoDto }), beneficiariosController.corregirDocumento);

// --- /habeas-data ---
export const habeasDataRoutes: Router = Router();
habeasDataRoutes.get('/solicitudes', authenticate(), requireAnyPermission('habeas_data:gestionar', 'habeas_data:solicitar'), validate({ query: ListarHabeasDataQueryDto }), habeasDataController.bandeja);
habeasDataRoutes.patch('/solicitudes/:id/resolver', authenticate(), requirePermission('habeas_data:gestionar'), validate({ params: IdParamSchema, body: ResolverHabeasDataDto }), habeasDataController.resolver);

/** Router agregado (convencion `<modulo>Routes`); los prefijos reales se registran por separado en modules/index.ts. */
export const accountsRoutes: Router = Router();
accountsRoutes.use('/funcionarios', funcionariosRoutes);
accountsRoutes.use('/administradores', administradoresRoutes);
accountsRoutes.use('/beneficiarios', beneficiariosRoutes);
accountsRoutes.use('/habeas-data', habeasDataRoutes);
