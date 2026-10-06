import { PaginacionQuerySchema, type Paginado, type PaginacionQuery } from '@foest/shared';

/**
 * Paginacion estandar (DECISIONES section 1):
 *   query `?page=1&page_size=20`  ->  respuesta `{ data, page, page_size, total }`.
 */
export function parsearPaginacion(query: unknown): PaginacionQuery {
  return PaginacionQuerySchema.parse(query ?? {});
}

/** Rango `[desde, hasta]` (inclusivo) para `.range()` de supabase-js. */
export function rangoSupabase(p: PaginacionQuery): { desde: number; hasta: number } {
  const desde = (p.page - 1) * p.page_size;
  return { desde, hasta: desde + p.page_size - 1 };
}

export function paginar<T>(data: T[], p: PaginacionQuery, total: number): Paginado<T> {
  return { data, page: p.page, page_size: p.page_size, total };
}
