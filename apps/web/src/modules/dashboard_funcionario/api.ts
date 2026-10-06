import { api } from '../../lib/api';
import type {
  FiltrosDashboard,
  RespuestaCarga,
  RespuestaConvocatorias,
  RespuestaDistribucion,
  RespuestaResumen,
  RespuestaSerie,
  RespuestaTiempos,
} from './types';

const BASE = '/dashboard/funcionario';

function query(f: FiltrosDashboard) {
  return { convocatoria_id: f.convocatoria_id, desde: f.desde, hasta: f.hasta };
}

/** Cliente HTTP del modulo (sin exportacion: es exclusiva de export_reports). */
export const dashboardFuncionarioApi = {
  resumen: (f: FiltrosDashboard) => api.get<RespuestaResumen>(`${BASE}/resumen`, { query: query(f) }),
  porBeneficio: (f: FiltrosDashboard) => api.get<RespuestaDistribucion>(`${BASE}/por-beneficio`, { query: query(f) }),
  porTipoSolicitud: (f: FiltrosDashboard) => api.get<RespuestaDistribucion>(`${BASE}/por-tipo-solicitud`, { query: query(f) }),
  serieTemporal: (f: FiltrosDashboard) => api.get<RespuestaSerie>(`${BASE}/serie-temporal`, { query: query(f) }),
  tiemposRevision: (f: FiltrosDashboard) => api.get<RespuestaTiempos>(`${BASE}/tiempos-revision`, { query: query(f) }),
  carga: (f: FiltrosDashboard) => api.get<RespuestaCarga>(`${BASE}/carga`, { query: query(f) }),
  convocatorias: () => api.get<RespuestaConvocatorias>(`${BASE}/convocatorias`),
};
