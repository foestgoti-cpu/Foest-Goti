/**
 * Punto unico de importacion de la infraestructura transversal para los modulos:
 *   import { authenticate, requirePermission, validate, AppError, auditar, supabaseAdmin, supabaseAsUser } from '../../shared';
 */
export * from './errors';
export * from './logger';
export * from './types';
export * from './auth.middleware';
export * from './rbac.matrix';
export * from './audit';
export * from './pagination';
export * from './validate';
export { supabaseAdmin, supabaseAsUser, getSupabaseAdmin } from './supabase';
