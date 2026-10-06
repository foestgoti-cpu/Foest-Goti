import type { RequestHandler } from 'express';

/**
 * Sustituto de `authenticate()` para pruebas (sin Supabase).
 *
 * Uso en un archivo de prueba (ANTES de importar la app):
 *   jest.mock('../../../shared/auth.middleware', () => require('./auth-simulada').moduloAuthSimulado());
 *
 * Tokens simulados (`Authorization: Bearer <token>`):
 *   - `test:ADMINISTRADOR` | `test:FUNCIONARIO` | `test:BENEFICIARIO`  -> req.user con ese rol
 *   - `test:<ROL>:inactivo`                                            -> 403 CUENTA_INACTIVA
 *   - sin cabecera                                                     -> 401 NO_AUTENTICADO
 *   - cualquier otro valor                                             -> 401 TOKEN_INVALIDO
 *
 * El resto del modulo real (`usuarioActual`) se conserva. El handler devuelto
 * lleva la marca `__authenticate = true` para que la prueba de matriz pueda
 * reconocer que una ruta exige token.
 */
export const USUARIOS_SIMULADOS = {
  ADMINISTRADOR: { id: '00000000-0000-4000-8000-000000000001', email: 'qa+admin@foest.test' },
  FUNCIONARIO: { id: '00000000-0000-4000-8000-000000000002', email: 'qa+funcionario@foest.test' },
  BENEFICIARIO: { id: '00000000-0000-4000-8000-000000000003', email: 'qa+beneficiario@foest.test' },
} as const;

export function tokenDe(rol: keyof typeof USUARIOS_SIMULADOS, inactivo = false): string {
  return `test:${rol}${inactivo ? ':inactivo' : ''}`;
}

export function moduloAuthSimulado(): Record<string, unknown> {
  const real = jest.requireActual<Record<string, unknown>>('../../../shared/auth.middleware');
  const { AppError } = jest.requireActual<typeof import('../../../shared/errors')>('../../../shared/errors');
  const { RolSchema } = jest.requireActual<typeof import('@foest/shared')>('@foest/shared');

  function authenticate(): RequestHandler {
    const handler: RequestHandler = (req, _res, next) => {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) return next(AppError.noAutenticado());
      const token = header.slice('Bearer '.length).trim();
      const partes = token.split(':');
      if (partes[0] !== 'test' || partes.length < 2) {
        return next(AppError.noAutenticado('TOKEN_INVALIDO', 'Token invalido o vencido'));
      }
      const rol = RolSchema.safeParse(partes[1]);
      if (!rol.success) return next(AppError.noAutenticado('TOKEN_INVALIDO', 'Token invalido o vencido'));
      if (partes[2] === 'inactivo') return next(AppError.cuentaInactiva());
      const base = USUARIOS_SIMULADOS[rol.data];
      req.user = { id: base.id, email: base.email, rol: rol.data, token };
      return next();
    };
    return Object.assign(handler, { __authenticate: true });
  }

  return { ...real, authenticate };
}
