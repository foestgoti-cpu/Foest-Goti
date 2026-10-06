import type { Paginado } from '@foest/shared';
import { paginar, rangoSupabase, supabaseAsUser, AppError, type UsuarioAutenticado } from '../../shared';
import type { EjemploQuery } from './ejemplo.dto';
import type { BeneficioItem } from './ejemplo.types';

/**
 * Servicio: reglas de negocio y acceso a datos.
 * Usa `supabaseAsUser(user.token)` para que RLS aplique como segunda barrera;
 * `supabaseAdmin` solo para operaciones de sistema (auditoria, cambios de rol).
 */
export const ejemploService = {
  async listar(user: UsuarioAutenticado, query: EjemploQuery): Promise<Paginado<BeneficioItem>> {
    const db = supabaseAsUser(user.token);
    const { desde, hasta } = rangoSupabase(query);
    const { data, error, count } = await db
      .from('beneficio')
      .select('codigo, nombre, categoria, activo', { count: 'exact' })
      .order('codigo')
      .range(desde, hasta);
    if (error) throw AppError.interno(`No fue posible consultar beneficios: ${error.message}`);
    return paginar((data ?? []) as BeneficioItem[], query, count ?? 0);
  },
};
