import { api } from '../../../../packages/shared/src/api';

export const formatosApi = {
  generarFormato: async (postulacionId: string, tipo: string) => {
    const { data } = await api.post(`/postulaciones/${postulacionId}/formatos/${tipo}/generar`);
    return data;
  },

  getFormatos: async (postulacionId: string) => {
    const { data } = await api.get(`/postulaciones/${postulacionId}/formatos`);
    return data;
  },

  getUrlDescarga: async (formatoId: string) => {
    const { data } = await api.get(`/formatos/${formatoId}/descarga`);
    return data;
  },

  verificarPublico: async (codigo: string) => {
    const { data } = await api.get(`/publico/verificar/${codigo}`);
    return data;
  }
};

