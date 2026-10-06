import type { RequestHandler } from 'express';
import { RolSchema } from '@foest/shared';
import { AppError } from './errors';
import { supabaseAdmin } from './supabase';
import { hasSupabaseCredentials } from '../config/env';
import type { UsuarioAutenticado } from './types';
import './types';

/**
 * `authenticate()`:
 *  1. Extrae el Bearer token. Sin token -> 401.
 *  2. Lo valida con `supabaseAdmin.auth.getUser(token)` (rechaza usuarios inexistentes o deshabilitados en Auth) -> 401.
 *  3. Carga `public.usuario`; si `activo = false` -> 403 CUENTA_INACTIVA.
 *  4. Expone `req.user = { id, email, rol, token }`. El rol se toma de `app_metadata.rol`
 *     (escrito solo por la API con service role) y se contrasta con `public.usuario.rol`.
 *
 * Uso: `router.get('/ruta', authenticate(), requirePermission('x:y'), handler)`.
 */
export function authenticate(): RequestHandler {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        throw AppError.noAutenticado();
      }
      const token = header.slice('Bearer '.length).trim();
      if (!token) throw AppError.noAutenticado();

      if (!hasSupabaseCredentials()) {
        // Sin claves no es posible validar tokens: se informa con claridad en lugar de un 500 opaco.
        throw new AppError(503, 'SIN_CREDENCIALES_SUPABASE', 'La API no tiene credenciales de Supabase configuradas');
      }

      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data?.user) {
        throw AppError.noAutenticado('TOKEN_INVALIDO', 'Token invalido o vencido');
      }
      const authUser = data.user;

      const { data: perfil, error: errPerfil } = await supabaseAdmin
        .from('usuario')
        .select('id, email, rol, activo')
        .eq('id', authUser.id)
        .maybeSingle();
      if (errPerfil) throw AppError.interno('No fue posible cargar el usuario');
      if (!perfil) {
        // El trigger on_auth_user_created deberia haberlo creado; si no existe, se rechaza.
        throw AppError.noAutenticado('USUARIO_SIN_PERFIL', 'El usuario no tiene perfil en la plataforma');
      }
      if (perfil.activo === false) throw AppError.cuentaInactiva();

      const rolClaim = (authUser.app_metadata as Record<string, unknown> | undefined)?.rol ?? perfil.rol;
      const rol = RolSchema.safeParse(rolClaim);
      if (!rol.success) throw AppError.sinPermiso('ROL_INVALIDO', 'El usuario no tiene un rol valido');

      const user: UsuarioAutenticado = {
        id: authUser.id,
        email: perfil.email ?? authUser.email ?? '',
        rol: rol.data,
        token,
      };
      req.user = user;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Obtiene `req.user` o lanza 401 (util en controladores). */
export function usuarioActual(req: { user?: UsuarioAutenticado }): UsuarioAutenticado {
  if (!req.user) throw AppError.noAutenticado();
  return req.user;
}
