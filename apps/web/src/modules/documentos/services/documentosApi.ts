import { api } from '../../../../packages/shared/src/api';
// Normally imported from @foest/shared, mapped in tsconfig

export const documentosApi = {
  getRequisitos: async (convocatoriaId: string, beneficios?: string[], tipoTramite?: string) => {
    let url = `/convocatorias/${convocatoriaId}/requisitos-documentos`;
    if (beneficios && tipoTramite) {
      url += `?beneficios=${beneficios.join(',')}&tipo_tramite=${tipoTramite}`;
    }
    const { data } = await api.get(url);
    return data;
  },

  getUploadUrl: async (postulacionId: string, payload: any) => {
    const { data } = await api.post(`/postulaciones/${postulacionId}/documentos/upload-url`, payload);
    return data;
  },

  confirmarUpload: async (documentoId: string, version: number, sha256?: string) => {
    const { data } = await api.post(`/documentos/${documentoId}/confirmar`, { version, sha256 });
    return data;
  },

  getUrlLectura: async (documentoId: string) => {
    const { data } = await api.get(`/documentos/${documentoId}/url`);
    return data;
  }
};

