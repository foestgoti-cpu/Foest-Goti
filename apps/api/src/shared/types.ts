import type { Rol } from '@foest/shared';

/** Usuario autenticado que `authenticate()` coloca en `req.user`. */
export interface UsuarioAutenticado {
  id: string;
  email: string;
  rol: Rol;
  /** Access token del usuario; usarlo con `supabaseAsUser(token)` para que RLS aplique. */
  token: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UsuarioAutenticado;
      /** Request id generado por pino-http. */
      id?: string | number | object;
    }
  }
}

export {};
