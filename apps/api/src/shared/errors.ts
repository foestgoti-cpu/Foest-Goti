import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HTTP, type ApiError } from '@foest/shared';
import { logger } from './logger';

/**
 * Error de aplicacion con codigo HTTP y cuerpo estandar `{ code, message, details? }`.
 *
 * Convencion de codigos (DECISIONES section 2):
 *   401 sin token / token invalido
 *   403 usuario inactivo (CUENTA_INACTIVA) o rol sin permiso
 *   404 recurso ajeno / no asignado / excluido (oculta existencia)
 *   409 conflicto de estado o version
 *   422 datos invalidos o incompletos
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON(): ApiError {
    const body: ApiError = { code: this.code, message: this.message };
    if (this.details !== undefined) body.details = this.details;
    return body;
  }

  // Fabricas por situacion
  static noAutenticado(code = 'NO_AUTENTICADO', message = 'Autenticacion requerida') {
    return new AppError(HTTP.NO_AUTENTICADO, code, message);
  }
  static sinPermiso(code = 'SIN_PERMISO', message = 'El rol no tiene permiso para esta accion') {
    return new AppError(HTTP.SIN_PERMISO, code, message);
  }
  static cuentaInactiva() {
    return new AppError(HTTP.SIN_PERMISO, 'CUENTA_INACTIVA', 'La cuenta se encuentra inactiva');
  }
  static noEncontrado(code = 'NO_ENCONTRADO', message = 'Recurso no encontrado') {
    return new AppError(HTTP.NO_ENCONTRADO, code, message);
  }
  static conflicto(code: string, message: string, details?: unknown) {
    return new AppError(HTTP.CONFLICTO, code, message, details);
  }
  static datosInvalidos(code: string, message: string, details?: unknown) {
    return new AppError(HTTP.DATOS_INVALIDOS, code, message, details);
  }
  static interno(message = 'Error interno del servidor') {
    return new AppError(HTTP.ERROR_INTERNO, 'ERROR_INTERNO', message);
  }
}

/** Convierte los issues de Zod a un `details` legible por la UI. */
export function detallesZod(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
}

/** 404 para rutas no registradas. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.noEncontrado('RUTA_NO_ENCONTRADA', 'Ruta no encontrada'));
};

/** Manejador global: siempre responde `{ code, message, details? }`. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, request_id: req.id }, err.message);
    res.status(err.status).json(err.toJSON());
    return;
  }
  if (err instanceof ZodError) {
    res.status(HTTP.DATOS_INVALIDOS).json({
      code: 'DATOS_INVALIDOS',
      message: 'Datos invalidos',
      details: detallesZod(err),
    } satisfies ApiError);
    return;
  }
  // body-parser: JSON mal formado
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(HTTP.BAD_REQUEST).json({ code: 'JSON_INVALIDO', message: 'Cuerpo JSON mal formado' });
    return;
  }
  logger.error({ err, request_id: req.id }, 'Error no controlado');
  res.status(HTTP.ERROR_INTERNO).json({ code: 'ERROR_INTERNO', message: 'Error interno del servidor' } satisfies ApiError);
};
