import { Router } from 'express';
import { authenticate, requirePermission, validate } from '../../shared';
import { rolesPermissionsController } from './roles_permissions.controller';
import { RolIdParamSchema } from './roles_permissions.dto';

/**
 * Modulo roles_permissions (docs/modules/roles_permissions.md, DECISIONES section 19).
 * Solo lectura: los tres roles base son inmutables y la matriz se cambia editando
 * packages/shared/src/permisos.ts + el seed SQL y desplegando. No hay escritura.
 *
 * Dos prefijos registrados en src/modules/index.ts:
 *   /roles     -> rolesRoutes
 *   /permisos  -> permisosRoutes
 */
export const rolesRoutes: Router = Router();

// GET /api/v1/roles - lista de roles con descripcion (ADMINISTRADOR)
rolesRoutes.get('/', authenticate(), requirePermission('rol:consultar'), rolesPermissionsController.listarRoles);

// GET /api/v1/roles/:id/permisos - permisos de un rol (nombre o uuid) (ADMINISTRADOR)
rolesRoutes.get(
  '/:id/permisos',
  authenticate(),
  requirePermission('rol:consultar'),
  validate({ params: RolIdParamSchema }),
  rolesPermissionsController.permisosDeRol,
);

export const permisosRoutes: Router = Router();

// GET /api/v1/permisos/mios - permisos efectivos del usuario autenticado (cualquier rol).
// Solo authenticate(): es una ruta "solo autenticada" declarada en la lista
// RUTAS_SOLO_AUTENTICADAS de __tests__/matriz-acceso.test.ts.
permisosRoutes.get('/mios', authenticate(), rolesPermissionsController.permisosMios);

// GET /api/v1/permisos/matriz - matriz completa rol x permiso (ADMINISTRADOR)
permisosRoutes.get('/matriz', authenticate(), requirePermission('rol:consultar'), rolesPermissionsController.matriz);

// GET /api/v1/permisos - catalogo con categoria y alcance (ADMINISTRADOR)
permisosRoutes.get('/', authenticate(), requirePermission('rol:consultar'), rolesPermissionsController.catalogoPermisos);
