import type { RequestHandler } from 'express';
import { usuarioActual } from '../../shared';
import { rolesPermissionsService } from './roles_permissions.service';
import type { RolIdParam } from './roles_permissions.dto';

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
export const rolesPermissionsController = {
  listarRoles: ((_req, res, next) => {
    try {
      res.json({ data: rolesPermissionsService.listarRoles() });
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  permisosDeRol: (async (req, res, next) => {
    try {
      const user = usuarioActual(req);
      const { id } = req.params as unknown as RolIdParam;
      res.json(await rolesPermissionsService.permisosDeRol(user, id));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  catalogoPermisos: ((_req, res, next) => {
    try {
      res.json({ data: rolesPermissionsService.catalogoPermisos() });
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  matriz: ((_req, res, next) => {
    try {
      res.json(rolesPermissionsService.matriz());
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  permisosMios: ((req, res, next) => {
    try {
      res.json(rolesPermissionsService.permisosMios(usuarioActual(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
