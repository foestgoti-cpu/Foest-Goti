import type { Permiso, Rol, TipoDocumentoIdentidad } from '@foest/shared';

/** Fila de `public.usuario` que usa el modulo. */
export interface UsuarioFila {
  id: string;
  email: string;
  rol: Rol;
  activo: boolean;
  forzar_cambio_clave: boolean;
  ultimo_login: string | null;
}

/** Usuario tal como se devuelve al cliente (sin datos internos). */
export interface UsuarioSalida {
  id: string;
  email: string;
  rol: Rol;
  forzar_cambio_clave: boolean;
}

/** Tokens de Supabase Auth devueltos por login/refresh. */
export interface SesionSalida {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number | null;
}

export interface LoginSalida extends SesionSalida {
  usuario: UsuarioSalida;
}

export interface RegistroSalida {
  id: string;
  email: string;
  rol: Rol;
  /** `true` cuando Supabase exige confirmar el correo antes de iniciar sesion. */
  requiere_verificacion: boolean;
}

export interface PerfilBeneficiarioBasico {
  tipo: 'BENEFICIARIO';
  id: string;
  nombres: string | null;
  apellidos: string | null;
  tipo_documento: TipoDocumentoIdentidad | null;
  numero_documento: string | null;
  es_menor: boolean;
  perfil_completo: boolean;
}

export interface PerfilFuncionarioBasico {
  tipo: 'FUNCIONARIO';
  id: string;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  dependencia: string | null;
}

export interface MeSalida {
  usuario: UsuarioSalida;
  permisos: Permiso[];
  perfil: PerfilBeneficiarioBasico | PerfilFuncionarioBasico | null;
  forzar_cambio_clave: boolean;
}

export interface ConsentimientoVigente {
  version: number;
  texto: string;
}

/** Contexto de la peticion que necesita el servicio (ip, user agent, request id). */
export interface ContextoPeticion {
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
}
