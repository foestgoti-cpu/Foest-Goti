import type { DescargaReporteDto, FormatoConsolidado, FiltrosConsolidado, MisReportesQuery, ReporteDto, SolicitudReporteRespuestaDto } from '@foest/shared';
import { API_URL, api, ApiRequestError, type Paginado } from '../../lib/api';
import { supabase } from '../../lib/supabase';

export const reportesApi = {
  solicitarConsolidado: (convocatoriaId: string, formato: FormatoConsolidado, filtros: FiltrosConsolidado = {}) =>
    api.post<SolicitudReporteRespuestaDto>(`/reportes/convocatorias/${convocatoriaId}/consolidado`, { formato, filtros }),
  obtenerJob: (id: string) => api.get<ReporteDto>(`/reportes/jobs/${id}`),
  misReportes: (q: Partial<MisReportesQuery> = {}) =>
    api.get<Paginado<ReporteDto>>('/reportes/me', { query: { page: q.page, page_size: q.page_size, estado: q.estado, tipo: q.tipo } }),
  urlDescarga: (id: string) => api.get<DescargaReporteDto>(`/reportes/${id}/descarga`),

  /** Descarga el resumen PDF (binario) con el token de sesion; devuelve el blob y el nombre sugerido. */
  async descargarResumen(postulacionId: string): Promise<{ blob: Blob; nombre: string }> {
    let token: string | null = null;
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
    }
    const res = await fetch(`${API_URL}/reportes/postulaciones/${postulacionId}/resumen.pdf`, {
      credentials: 'include',
      headers: { Accept: 'application/pdf', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      let cuerpo: { code?: string; message?: string } = {};
      try {
        cuerpo = (await res.json()) as typeof cuerpo;
      } catch {
        cuerpo = {};
      }
      throw new ApiRequestError(res.status, { code: cuerpo.code ?? 'ERROR_HTTP', message: cuerpo.message ?? 'No fue posible generar el resumen' });
    }
    const disp = res.headers.get('Content-Disposition') ?? '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disp);
    return { blob: await res.blob(), nombre: m?.[1] ? decodeURIComponent(m[1]) : `resumen-${postulacionId}.pdf` };
  },
};
