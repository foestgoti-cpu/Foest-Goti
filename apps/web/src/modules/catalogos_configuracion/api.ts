import type { ApiError } from '@foest/shared';
import { api, API_URL, ApiRequestError, type Paginado } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type {
  ConfiguracionItem,
  ConfiguracionPublica,
  ConsentimientoVigenteDto,
  DeclaracionJuramentada,
  DiasHabilesResultado,
  FestivoItem,
  FestivoPropuesto,
  IesSnies,
  ImportacionSnies,
  ProgramaSnies,
  ResultadoCargaAnual,
  ResumenImportacionSnies,
  TextoConsentimiento,
} from './types';

/** Cliente HTTP del modulo catalogos_configuracion. */
export const configuracionApi = {
  listar: (categoria?: string) => api.get<Paginado<ConfiguracionItem>>('/configuracion', { query: { categoria } }),
  obtener: (clave: string) => api.get<ConfiguracionItem>(`/configuracion/${clave}`),
  publica: () => api.get<ConfiguracionPublica>('/configuracion/publica'),
  actualizar: (clave: string, cuerpo: { valor: string | number | boolean | null; version: number; motivo?: string; confirmar: true }) =>
    api.put<ConfiguracionItem>(`/configuracion/${clave}`, cuerpo),
};

export const festivosApi = {
  listar: (anio: number) => api.get<{ anio: number; data: FestivoItem[] }>('/festivos', { query: { anio } }),
  crear: (cuerpo: { fecha: string; nombre: string }) => api.post<FestivoItem>('/festivos', cuerpo),
  eliminar: (id: string) => api.delete<void>(`/festivos/${id}`),
  propuesta: (anio: number) => api.get<{ anio: number; festivos: FestivoPropuesto[] }>('/festivos/propuesta', { query: { anio } }),
  cargaAnual: (cuerpo: { anio: number; festivos: FestivoPropuesto[]; confirmar: true }) => api.post<ResultadoCargaAnual>('/festivos/carga-anual', cuerpo),
  diasHabiles: (desde: string, n: number) => api.get<DiasHabilesResultado>('/festivos/dias-habiles', { query: { desde, n } }),
};

export const sniesApi = {
  buscarIes: (q: string, page = 1, page_size = 20) => api.get<Paginado<IesSnies>>('/catalogos/ies', { query: { q, page, page_size } }),
  programasDeIes: (codigoIes: string, q: string, page = 1, page_size = 20) =>
    api.get<Paginado<ProgramaSnies>>(`/catalogos/ies/${codigoIes}/programas`, { query: { q, page, page_size } }),
  detallePrograma: (codigo: string) => api.get<ProgramaSnies & { ies: IesSnies | null }>(`/catalogos/programas/${codigo}`),
  importaciones: (page = 1, page_size = 20) => api.get<Paginado<ImportacionSnies>>('/admin/catalogos/snies/importaciones', { query: { page, page_size } }),
  /** Envia el CSV crudo (text/csv). El cliente generico solo serializa JSON, por eso se usa fetch directo con el mismo Bearer. */
  importar: async (archivo: File, modo: 'real' | 'simulacion'): Promise<ResumenImportacionSnies> => {
    const contenido = await archivo.text();
    const sesion = supabase ? (await supabase.auth.getSession()).data.session : null;
    const token = sesion?.access_token ?? null;
    const url = new URL(`${API_URL}/admin/catalogos/snies/importar`);
    url.searchParams.set('modo', modo);
    url.searchParams.set('archivo_nombre', archivo.name.slice(0, 200));
    const res = await fetch(url.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'text/csv; charset=utf-8', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: contenido,
    });
    const texto = await res.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const cuerpo: ApiError =
        json && typeof json === 'object' && 'code' in (json as object) ? (json as ApiError) : { code: 'ERROR_HTTP', message: res.statusText || 'Error de comunicacion con la API' };
      throw new ApiRequestError(res.status, cuerpo);
    }
    return json as ResumenImportacionSnies;
  },
};

export const declaracionesApi = {
  vigentes: () => api.get<{ declaraciones: DeclaracionJuramentada[]; todas_confirmadas: boolean }>('/catalogos/declaraciones/vigentes'),
  todas: () => api.get<{ data: DeclaracionJuramentada[] }>('/admin/catalogos/declaraciones'),
  publicar: (codigo: string, cuerpo: { titulo: string; texto: string; texto_oficial_confirmado: boolean; motivo?: string; confirmar: true }) =>
    api.post<DeclaracionJuramentada>(`/admin/catalogos/declaraciones/${codigo}/versiones`, cuerpo),
  consentimientoVigente: () => api.get<ConsentimientoVigenteDto>('/catalogos/consentimiento/vigente', { auth: false }),
  versionesConsentimiento: () => api.get<{ data: TextoConsentimiento[] }>('/admin/catalogos/consentimiento/versiones'),
  publicarConsentimiento: (cuerpo: { texto: string; motivo?: string; confirmar: true }) =>
    api.post<TextoConsentimiento>('/admin/catalogos/consentimiento/versiones', cuerpo),
};
