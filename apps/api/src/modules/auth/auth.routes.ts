import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError, authenticate, validate } from '../../shared';
import { hasSupabaseCredentials } from '../../config/env';
import { authController } from './auth.controller';
import { AceptarInvitacionDto, ChangePasswordDto, ForgotDto, LoginDto, RefreshDto, RegisterDto, ResendDto } from './auth.dto';

/**
 * Router de autenticacion bajo /api/v1/auth (docs/modules/auth.md adaptado a
 * DECISIONES seccion 19: Supabase Auth; sin JWT propio ni tabla SESION).
 *
 * Rutas PUBLICAS (lista cerrada de DECISIONES seccion 7): register, login, refresh,
 * password/forgot, verify-email/resend, consentimiento/vigente. El resto exige
 * authenticate(). Los endpoints de auth no usan requirePermission: aplican a
 * todos los roles sobre la propia cuenta.
 */
export const authRoutes: Router = Router();

/** Sin credenciales de Supabase las rutas publicas responden 503 claro en vez de 500. */
const requireSupabase: RequestHandler = (_req, _res, next) => {
  if (!hasSupabaseCredentials()) {
    return next(new AppError(503, 'SIN_CREDENCIALES_SUPABASE', 'La API no tiene credenciales de Supabase configuradas'));
  }
  return next();
};

const limite = (max: number, code = 'DEMASIADAS_PETICIONES') =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { code, message: 'Demasiadas solicitudes; intente mas tarde' },
  });

// --- Publicas ---
authRoutes.get('/consentimiento/vigente', requireSupabase, authController.consentimientoVigente);

authRoutes.post('/register', requireSupabase, limite(10), validate({ body: RegisterDto }), authController.register);

// El limite fino por IP (20/15 min) y por email (5 fallos/15 min) lo aplica el servicio con intento_login.
authRoutes.post('/login', requireSupabase, limite(60), validate({ body: LoginDto }), authController.login);

authRoutes.post('/refresh', requireSupabase, limite(120), validate({ body: RefreshDto }), authController.refresh);

authRoutes.post('/password/forgot', requireSupabase, limite(5), validate({ body: ForgotDto }), authController.forgot);

authRoutes.post('/verify-email/resend', requireSupabase, limite(5), validate({ body: ResendDto }), authController.resendVerification);

// --- Autenticadas (todos los roles, sobre la propia cuenta) ---
authRoutes.post('/logout', authenticate(), authController.logout);

authRoutes.post('/password/change', authenticate(), validate({ body: ChangePasswordDto }), authController.changePassword);

authRoutes.post('/invitacion/aceptar', authenticate(), validate({ body: AceptarInvitacionDto }), authController.aceptarInvitacion);

authRoutes.get('/me', authenticate(), authController.me);
