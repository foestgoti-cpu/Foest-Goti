import { api, ApiRequestError } from '../../lib/api';
import type { ConsentimientoVigente, LoginRespuesta, MeRespuesta, RegistroRespuesta, SesionRespuesta } from './types';

export interface RegistroPayload {
  email: string;
  password: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  tipo_documento?: string;
  numero_documento?: string;
  aceptar_consentimiento: boolean;
  version_consentimiento: number;
  acudiente?: { nombre: string; tipo_documento: string; numero_documento: string; correo: string };
}

/** Cliente HTTP del modulo auth (envuelve `api` de lib/api.ts). */
export const authApi = {
  consentimientoVigente: () => api.get<ConsentimientoVigente>('/auth/consentimiento/vigente', { auth: false }),
  registrar: (body: RegistroPayload) => api.post<RegistroRespuesta>('/auth/register', body, { auth: false }),
  login: (email: string, password: string) => api.post<LoginRespuesta>('/auth/login', { email, password }, { auth: false }),
  olvidePassword: (email: string) => api.post<{ mensaje: string }>('/auth/password/forgot', { email }, { auth: false }),
  reenviarVerificacion: (email: string) => api.post<{ mensaje: string }>('/auth/verify-email/resend', { email }, { auth: false }),
  /** Devuelve una sesion nueva (cambiar la contrasena invalida las anteriores en Supabase). */
  cambiarPassword: (password_actual: string, password_nueva: string) =>
    api.post<SesionRespuesta>('/auth/password/change', { password_actual, password_nueva }),
  /** Devuelve una sesion nueva junto con el usuario activado. */
  aceptarInvitacion: (password: string) => api.post<LoginRespuesta>('/auth/invitacion/aceptar', { password }),
  me: () => api.get<MeRespuesta>('/auth/me'),
  logout: () => api.post<void>('/auth/logout'),
};

/** Traduce errores de la API a mensajes en lenguaje claro para el usuario. */
export function mensajeDeErrorApi(e: unknown, porDefecto = 'No fue posible completar la operacion. Intente de nuevo.'): string {
  if (!(e instanceof ApiRequestError)) {
    return e instanceof Error && /fetch|network|Failed/i.test(e.message)
      ? 'No fue posible comunicarse con el servidor. Verifique su conexion e intente de nuevo.'
      : porDefecto;
  }
  switch (e.code) {
    case 'CREDENCIALES_INVALIDAS':
      return 'Correo o contrasena incorrectos.';
    case 'CUENTA_INACTIVA':
      return 'Su cuenta se encuentra inactiva. Comuniquese con la Direccion del FOEST.';
    case 'EMAIL_NO_VERIFICADO':
      return 'Debe confirmar su correo electronico antes de iniciar sesion. Revise su bandeja de entrada o solicite un nuevo enlace.';
    case 'CUENTA_BLOQUEADA_TEMPORAL':
      return 'Por seguridad, el acceso con este correo quedo bloqueado temporalmente. Intente de nuevo en 15 minutos.';
    case 'DEMASIADOS_INTENTOS':
    case 'DEMASIADAS_PETICIONES':
      return 'Se realizaron demasiados intentos. Espere unos minutos e intente de nuevo.';
    case 'EMAIL_EN_USO':
      return 'Ya existe una cuenta registrada con este correo. Inicie sesion o recupere su contrasena.';
    case 'DOCUMENTO_EN_USO':
      return 'Ya existe una cuenta registrada con este numero de documento.';
    case 'CONSENTIMIENTO_REQUERIDO':
      return 'Debe aceptar el tratamiento de datos personales para continuar.';
    case 'CONSENTIMIENTO_DESACTUALIZADO':
      return 'El texto de consentimiento fue actualizado. Vuelva a leerlo y aceptarlo.';
    case 'ACUDIENTE_REQUERIDO':
      return 'Los menores de edad deben registrar los datos de su acudiente.';
    case 'CLAVE_ACTUAL_INCORRECTA':
      return 'La contrasena actual no es correcta.';
    case 'PASSWORD_DEBIL':
      return 'La contrasena no cumple la politica de seguridad.';
    case 'SIN_CREDENCIALES_SUPABASE':
      return 'El servidor no tiene configurada la conexion con Supabase.';
    case 'DATOS_INVALIDOS':
      return 'Revise los datos ingresados: hay campos invalidos o incompletos.';
    default:
      return e.message || porDefecto;
  }
}
