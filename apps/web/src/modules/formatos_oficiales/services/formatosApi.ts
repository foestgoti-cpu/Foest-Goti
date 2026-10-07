import { api } from '../../../lib/api';
import type { DescargaFormatoDto, FormatoGeneradoDto, ListadoFormatosDto, TipoFormato, VerificarFormatoDto } from '../types';

/** Cliente HTTP del modulo (envuelve `api` de lib/api.ts, que adjunta el Bearer). */
export const formatosApi = {
  generarFormato: (postulacionId: string, tipo: TipoFormato) =>
    api.post<FormatoGeneradoDto>(`/postulaciones/${postulacionId}/formatos/${tipo}/generar`),

  getFormatos: (postulacionId: string) => api.get<ListadoFormatosDto>(`/postulaciones/${postulacionId}/formatos`),

  getFormato: (formatoId: string) => api.get<FormatoGeneradoDto>(`/formatos/${formatoId}`),

  getUrlDescarga: (formatoId: string) => api.get<DescargaFormatoDto>(`/formatos/${formatoId}/descarga`),

  verificarPublico: (codigo: string) => api.get<VerificarFormatoDto>(`/publico/verificar/${encodeURIComponent(codigo)}`, { auth: false }),
};
