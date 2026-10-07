import type { RequestHandler } from 'express';
import type { AccionOtorgamiento } from '@foest/shared';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { procesarCargaMasiva } from './seguimiento_beneficios.carga';
import type {
  AnularDesembolsoInput,
  CambioEstadoOtorgamientoInput,
  CargaMasivaPagosInput,
  CuposQueryInput,
  CumplirOtorgamientoInput,
  FiltrosOtorgamientosInput,
  PagarDesembolsoInput,
  ProgramarDesembolsoInput,
} from './seguimiento_beneficios.dto';
import { seguimientoService } from './seguimiento_beneficios.service';

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
function cambioEstado(accion: AccionOtorgamiento): RequestHandler {
  return (async (req, res, next) => {
    try {
      res.json(
        await seguimientoService.cambiarEstado(
          usuarioActual(req),
          contextoDesdeRequest(req),
          req.params.id as string,
          accion,
          req.body as CambioEstadoOtorgamientoInput | CumplirOtorgamientoInput,
        ),
      );
    } catch (e) {
      next(e);
    }
  }) as RequestHandler;
}

export const seguimientoController = {
  listar: (async (req, res, next) => {
    try {
      res.json(await seguimientoService.listar(req.query as unknown as FiltrosOtorgamientosInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  detalle: (async (req, res, next) => {
    try {
      res.json(await seguimientoService.detalle(contextoDesdeRequest(req), req.params.id as string));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  suspender: cambioEstado('SUSPENDER'),
  revocar: cambioEstado('REVOCAR'),
  reactivar: cambioEstado('REACTIVAR'),
  cumplir: cambioEstado('CUMPLIR'),

  programarDesembolso: (async (req, res, next) => {
    try {
      res.status(201).json(await seguimientoService.programarDesembolso(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as ProgramarDesembolsoInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  pagarDesembolso: (async (req, res, next) => {
    try {
      res.json(await seguimientoService.pagarDesembolso(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as PagarDesembolsoInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  anularDesembolso: (async (req, res, next) => {
    try {
      res.json(await seguimientoService.anularDesembolso(usuarioActual(req), contextoDesdeRequest(req), req.params.id as string, req.body as AnularDesembolsoInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  cargaMasiva: (async (req, res, next) => {
    try {
      res.json(await procesarCargaMasiva(usuarioActual(req), contextoDesdeRequest(req), req.body as CargaMasivaPagosInput));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  cupos: (async (req, res, next) => {
    try {
      res.json(await seguimientoService.cupos((req.query as unknown as CuposQueryInput).convocatoria_id));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  misOtorgamientos: (async (req, res, next) => {
    try {
      res.json(await seguimientoService.misOtorgamientos(usuarioActual(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  miOtorgamiento: (async (req, res, next) => {
    try {
      const lista = await seguimientoService.misOtorgamientos(usuarioActual(req), req.params.id as string);
      res.json(lista[0]);
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
