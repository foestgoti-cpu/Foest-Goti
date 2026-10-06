import { API_URL, ApiRequestError, api, type Paginado } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { AuditoriaEvento, AuditoriaFiltros, CatalogoAuditoria, EstadoIntegridadAuditoria, LineaTiempoAuditoria } from './types';

/** Cliente HTTP del modulo auditoria (solo lectura; la exportacion descarga un CSV). */
export const auditoriaApi = {
  catalogo: () => api.get<CatalogoAuditoria>('/auditoria/catalogo'),
  listar: (filtros: AuditoriaFiltros, page: number, page_size = 20) =>
    api.get<Paginado<AuditoriaEvento>>('/auditoria', { query: { ...filtros, page, page_size } }),
  detalle: (id: string) => api.get<AuditoriaEvento>(`/auditoria/${id}`),
  porEntidad: (entidad: string, entidadId: string) =>
    api.get<LineaTiempoAuditoria>(`/auditoria/entidad/${encodeURIComponent(entidad)}/${encodeURIComponent(entidadId)}`),
  integridad: () => api.get<EstadoIntegridadAuditoria>('/auditoria/integridad'),

  /**
   * `GET /auditoria/exportar` responde `text/csv` (no JSON), por eso no usa `api.get`.
   * Devuelve el archivo como Blob y su nombre sugerido.
   */
  async exportar(filtros: AuditoriaFiltros, motivo: string): Promise<{ blob: Blob; nombre: string }> {
    const url = new URL(`${API_URL}/auditoria/exportar`);
    for (const [k, v] of Object.entries({ ...filtros, motivo, formato: 'CSV' })) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
    const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
    const res = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'text/csv, application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      let cuerpo: { code: string; message: string; details?: unknown } = { code: 'ERROR_HTTP', message: res.statusText || 'Error de comunicacion con la API' };
      try {
        const json = (await res.json()) as { code?: string; message?: string; details?: unknown };
        if (json && typeof json.code === 'string' && typeof json.message === 'string') cuerpo = { code: json.code, message: json.message, details: json.details };
      } catch {
        // cuerpo no JSON: se conserva el mensaje generico
      }
      throw new ApiRequestError(res.status, cuerpo);
    }
    const disposicion = res.headers.get('Content-Disposition') ?? '';
    const coincidencia = /filename="([^"]+)"/.exec(disposicion);
    return { blob: await res.blob(), nombre: coincidencia?.[1] ?? 'auditoria.csv' };
  },
};
