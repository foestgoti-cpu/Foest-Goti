import type { ApiError, Paginado } from '@foest/shared';
import { supabase } from './supabase';

/**
 * Cliente HTTP hacia la API de negocio (`/api/v1`).
 * - Agrega `Authorization: Bearer <access_token>` desde la sesion de Supabase.
 * - Si la API responde 401, refresca la sesion una vez y reintenta.
 * - Los errores se lanzan como `ApiRequestError` con `{ status, code, message, details }`.
 *
 * Uso en modulos (src/modules/<modulo>/api.ts):
 *   export const convocatoriasApi = { listar: (q) => api.get<Paginado<Convocatoria>>('/convocatorias', { query: q }) }
 */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: Query;
  headers?: Record<string, string>;
  /** Por defecto `true`: adjunta el Bearer de la sesion. */
  auth?: boolean;
  signal?: AbortSignal;
}

async function accessToken(forzarRefresco = false): Promise<string | null> {
  if (!supabase) return null;
  if (forzarRefresco) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function construirUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function ejecutar<T>(metodo: string, path: string, body?: unknown, opciones: RequestOptions = {}): Promise<T> {
  const auth = opciones.auth ?? true;
  const hacer = async (token: string | null): Promise<Response> =>
    fetch(construirUrl(path, opciones.query), {
      method: metodo,
      credentials: 'include',
      signal: opciones.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opciones.headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let token = auth ? await accessToken() : null;
  let res = await hacer(token);

  if (res.status === 401 && auth && supabase) {
    token = await accessToken(true);
    if (token) res = await hacer(token);
  }

  if (res.status === 204) return undefined as T;

  const texto = await res.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const cuerpo: ApiError =
      json && typeof json === 'object' && 'code' in (json as object)
        ? (json as ApiError)
        : { code: 'ERROR_HTTP', message: res.statusText || 'Error de comunicacion con la API' };
    throw new ApiRequestError(res.status, cuerpo);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, o?: RequestOptions) => ejecutar<T>('GET', path, undefined, o),
  post: <T>(path: string, body?: unknown, o?: RequestOptions) => ejecutar<T>('POST', path, body, o),
  put: <T>(path: string, body?: unknown, o?: RequestOptions) => ejecutar<T>('PUT', path, body, o),
  patch: <T>(path: string, body?: unknown, o?: RequestOptions) => ejecutar<T>('PATCH', path, body, o),
  delete: <T>(path: string, o?: RequestOptions) => ejecutar<T>('DELETE', path, undefined, o),
};

export type { Paginado };
