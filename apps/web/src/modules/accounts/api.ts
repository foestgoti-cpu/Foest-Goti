import type {
  ActualizarFuncionarioDto,
  CambiarEstadoCuentaDto,
  CorregirDocumentoDto,
  CrearFuncionarioDto,
  PerfilBeneficiarioDto,
  ResolverHabeasDataDto,
  SolicitudHabeasDataDto,
} from '@foest/shared';
import { api, type Paginado } from '../../lib/api';
import type {
  AdministradorCuenta,
  BeneficiarioCuenta,
  BeneficiarioFila,
  ConsentimientoFila,
  FuncionarioCuenta,
  FuncionarioDetalle,
  PerfilBeneficiario,
  SolicitudHabeasData,
} from './types';

export interface FiltrosFuncionarios {
  page?: number;
  q?: string;
  estado?: 'ACTIVO' | 'INACTIVO' | '';
  dependencia?: string;
}

export interface FiltrosBeneficiarios {
  page?: number;
  q?: string;
  estado?: 'ACTIVO' | 'INACTIVO' | '';
}

/** Cliente HTTP del modulo accounts (envuelve `api` de lib/api.ts). */
export const accountsApi = {
  // Funcionarios
  listarFuncionarios: (f: FiltrosFuncionarios) =>
    api.get<Paginado<FuncionarioCuenta>>('/funcionarios', { query: { page: f.page ?? 1, page_size: 20, q: f.q, estado: f.estado, dependencia: f.dependencia } }),
  dependencias: () => api.get<{ data: string[] }>('/funcionarios/dependencias'),
  funcionario: (id: string) => api.get<FuncionarioDetalle>(`/funcionarios/${id}`),
  invitarFuncionario: (dto: CrearFuncionarioDto) => api.post<FuncionarioCuenta>('/funcionarios', dto),
  actualizarFuncionario: (id: string, dto: ActualizarFuncionarioDto) => api.patch<FuncionarioCuenta>(`/funcionarios/${id}`, dto),
  estadoFuncionario: (id: string, dto: CambiarEstadoCuentaDto) => api.patch<FuncionarioCuenta>(`/funcionarios/${id}/estado`, dto),
  reenviarInvitacion: (id: string) => api.post<{ reenviada: true }>(`/funcionarios/${id}/invitacion/reenviar`),

  // Administradores
  listarAdministradores: (page = 1) => api.get<Paginado<AdministradorCuenta>>('/administradores', { query: { page, page_size: 20 } }),
  estadoAdministrador: (id: string, dto: CambiarEstadoCuentaDto) => api.patch<AdministradorCuenta>(`/administradores/${id}/estado`, dto),

  // Beneficiario (titular)
  perfilPropio: () => api.get<PerfilBeneficiario>('/beneficiarios/me'),
  actualizarPerfilPropio: (dto: PerfilBeneficiarioDto) => api.put<PerfilBeneficiario>('/beneficiarios/me', dto),
  consentimientosPropios: () => api.get<{ version_vigente: number; aceptada: boolean; historial: ConsentimientoFila[] }>('/beneficiarios/me/consentimientos'),
  aceptarConsentimiento: () => api.post<{ version: number; aceptado_en: string }>('/beneficiarios/me/consentimientos'),
  exportarDatosPropios: () => api.get<unknown>('/beneficiarios/me/datos'),
  habeasDataPropias: () => api.get<{ data: SolicitudHabeasData[] }>('/beneficiarios/me/habeas-data'),
  radicarHabeasData: (dto: SolicitudHabeasDataDto) => api.post<SolicitudHabeasData>('/beneficiarios/me/habeas-data', dto),

  // Beneficiarios (administrador)
  listarBeneficiarios: (f: FiltrosBeneficiarios) =>
    api.get<Paginado<BeneficiarioCuenta>>('/beneficiarios', { query: { page: f.page ?? 1, page_size: 20, q: f.q, estado: f.estado } }),
  beneficiario: (id: string) => api.get<PerfilBeneficiario>(`/beneficiarios/${id}`),
  estadoBeneficiario: (id: string, dto: CambiarEstadoCuentaDto) => api.patch<BeneficiarioCuenta>(`/beneficiarios/${id}/estado`, dto),
  corregirDocumento: (id: string, dto: CorregirDocumentoDto) => api.patch<BeneficiarioFila>(`/beneficiarios/${id}/documento`, dto),

  // Habeas data (administrador)
  bandejaHabeasData: (page = 1, estado?: string) =>
    api.get<Paginado<SolicitudHabeasData>>('/habeas-data/solicitudes', { query: { page, page_size: 20, estado } }),
  resolverHabeasData: (id: string, dto: ResolverHabeasDataDto) => api.patch<SolicitudHabeasData>(`/habeas-data/solicitudes/${id}/resolver`, dto),
};
