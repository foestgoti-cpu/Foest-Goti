import type { RequestHandler } from 'express';
import { usuarioActual } from '../../shared';
import { dashboardFuncionarioService } from './dashboard_funcionario.service';
import type { FiltrosDashboard } from './dashboard_funcionario.dto';

type Operacion = Exclude<keyof typeof dashboardFuncionarioService, 'convocatorias'>;

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
function conFiltros(operacion: Operacion): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = usuarioActual(req);
      const filtros = req.query as unknown as FiltrosDashboard;
      const resultado = await dashboardFuncionarioService[operacion](user, filtros);
      res.json(resultado);
    } catch (e) {
      next(e);
    }
  };
}

export const dashboardFuncionarioController = {
  resumen: conFiltros('resumen'),
  porBeneficio: conFiltros('porBeneficio'),
  porTipoSolicitud: conFiltros('porTipoSolicitud'),
  serieTemporal: conFiltros('serieTemporal'),
  tiemposRevision: conFiltros('tiemposRevision'),
  carga: conFiltros('carga'),

  convocatorias: (async (req, res, next) => {
    try {
      const user = usuarioActual(req);
      res.json(await dashboardFuncionarioService.convocatorias(user));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
