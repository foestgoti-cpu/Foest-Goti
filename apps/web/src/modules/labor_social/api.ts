import { api } from '../../lib/api';
import type {
  ActividadInput,
  CertificadoDto,
  CrearCertificadoInput,
  DescargaCertificadoDto,
  LaborSocialBeneficiarioDto,
  MisCertificadosDto,
} from './types';

/** Cliente HTTP del modulo labor_social (envuelve `api` de lib/api.ts, que adjunta el Bearer). */
export const laborSocialApi = {
  misCertificados: () => api.get<MisCertificadosDto>('/labor-social/me'),

  crear: (body: CrearCertificadoInput) => api.post<CertificadoDto>('/labor-social', body),

  agregarActividad: (id: string, body: ActividadInput) => api.post<CertificadoDto>(`/labor-social/${id}/actividades`, body),

  editarActividad: (id: string, actividadId: string, body: Partial<ActividadInput>) =>
    api.patch<CertificadoDto>(`/labor-social/${id}/actividades/${actividadId}`, body),

  eliminarActividad: (id: string, actividadId: string) => api.delete<CertificadoDto>(`/labor-social/${id}/actividades/${actividadId}`),

  completar: (id: string) => api.patch<CertificadoDto>(`/labor-social/${id}/completar`, { confirmar: true }),

  reabrir: (id: string) => api.patch<CertificadoDto>(`/labor-social/${id}/reabrir`, { confirmar: true }),

  presentar: (id: string, documentoId: string) =>
    api.patch<CertificadoDto>(`/labor-social/${id}/presentar`, { documento_id: documentoId, confirmar: true }),

  /** URL firmada de 300 s del GE-F038 (borrador si el certificado esta EN_PROCESO). */
  certificadoPdf: (id: string) => api.get<DescargaCertificadoDto>(`/labor-social/${id}/certificado.pdf`),

  /** Funcionario con asignacion activa o administrador. */
  porBeneficiario: (beneficiarioId: string) => api.get<LaborSocialBeneficiarioDto>(`/beneficiarios/${beneficiarioId}/labor-social`),
};
