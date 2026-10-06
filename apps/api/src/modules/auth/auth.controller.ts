import type { Request, RequestHandler } from 'express';
import { HTTP } from '@foest/shared';
import { contextoDesdeRequest, usuarioActual } from '../../shared';
import { authService } from './auth.service';
import { ErrorBloqueo } from './auth.intentos';
import type { AceptarInvitacionBody, ChangePasswordBody, ForgotBody, LoginBody, RefreshBody, RegisterBody } from './auth.dto';
import type { ContextoPeticion } from './auth.types';

function contexto(req: Request): ContextoPeticion {
  const c = contextoDesdeRequest(req);
  return { ip: c.ip ?? null, user_agent: c.user_agent ?? null, request_id: c.request_id ?? null };
}

/** Controlador: traduce HTTP <-> servicio. Sin reglas de negocio. */
export const authController = {
  consentimientoVigente: (async (_req, res, next) => {
    try {
      res.json(await authService.consentimientoVigente());
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  register: (async (req, res, next) => {
    try {
      const salida = await authService.registrar(req.body as RegisterBody, contexto(req));
      res.status(HTTP.CREATED).json(salida);
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  login: (async (req, res, next) => {
    try {
      const salida = await authService.login(req.body as LoginBody, contexto(req));
      res.json(salida);
    } catch (e) {
      if (e instanceof ErrorBloqueo) res.setHeader('Retry-After', String(e.retryAfterSeconds));
      next(e);
    }
  }) as RequestHandler,

  refresh: (async (req, res, next) => {
    try {
      const { refresh_token } = req.body as RefreshBody;
      res.json(await authService.refresh(refresh_token));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  logout: (async (req, res, next) => {
    try {
      await authService.logout(usuarioActual(req), contexto(req));
      res.status(HTTP.NO_CONTENT).end();
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  forgot: (async (req, res, next) => {
    try {
      await authService.olvidePassword((req.body as ForgotBody).email);
      res.status(HTTP.ACCEPTED).json({ mensaje: 'Si el correo esta registrado, recibira un enlace para restablecer su contrasena' });
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  changePassword: (async (req, res, next) => {
    try {
      // Devuelve una sesion nueva: cambiar la contrasena invalida las anteriores en Supabase.
      res.json(await authService.cambiarPassword(usuarioActual(req), req.body as ChangePasswordBody, contexto(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  resendVerification: (async (req, res, next) => {
    try {
      await authService.reenviarVerificacion((req.body as ForgotBody).email);
      res.status(HTTP.ACCEPTED).json({ mensaje: 'Si el correo esta registrado y pendiente de verificacion, recibira un nuevo enlace' });
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  aceptarInvitacion: (async (req, res, next) => {
    try {
      res.json(await authService.aceptarInvitacion(usuarioActual(req), req.body as AceptarInvitacionBody, contexto(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,

  me: (async (req, res, next) => {
    try {
      res.json(await authService.me(usuarioActual(req)));
    } catch (e) {
      next(e);
    }
  }) as RequestHandler,
};
