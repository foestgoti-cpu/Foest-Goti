import type { Rol, TipoDocumentoIdentidad } from '@foest/shared';

/** Fila de public.usuario (perfil de cuenta). */
export interface UsuarioFila {
  id: string;
  email: string;
  rol: Rol;
  activo: boolean;
  forzar_cambio_clave: boolean;
  ultimo_login: string | null;
  creado_en: string;
  actualizado_en: string;
}

/** Fila de la vista funcionario_cuenta. */
export interface FuncionarioCuenta {
  id: string;
  usuario_id: string;
  email: string;
  activo: boolean;
  ultimo_login: string | null;
  invitacion_pendiente: boolean;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  dependencia: string | null;
  invitado_en: string | null;
  invitacion_reenviada_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface ExpedientePendiente {
  postulacion_id: string;
  convocatoria_id: string;
  convocatoria_nombre: string | null;
  estado: string;
}

export interface PendientesFuncionario {
  asignaciones_activas: number;
  pendientes: number;
  expedientes: ExpedientePendiente[];
}

export interface FuncionarioDetalle extends FuncionarioCuenta {
  pendientes: PendientesFuncionario;
}

export interface AdministradorCuenta {
  id: string;
  email: string;
  activo: boolean;
  ultimo_login: string | null;
  creado_en: string;
}

/** Fila de public.beneficiario. */
export interface BeneficiarioFila {
  id: string;
  usuario_id: string;
  tipo_documento: TipoDocumentoIdentidad | null;
  numero_documento: string | null;
  expedido_en: string | null;
  nombres: string | null;
  apellidos: string | null;
  fecha_nacimiento: string | null;
  es_menor: boolean;
  perfil_completo: boolean;
  genero: string | null;
  estado_civil: string | null;
  direccion: string | null;
  sector: string | null;
  celular_1: string | null;
  celular_2: string | null;
  correo_notificacion_2: string | null;
  estrato: number | null;
  sisben_categoria: string | null;
  sisben_puntaje: number | null;
  anonimizado: boolean;
  anonimizado_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface AcudienteFila {
  id: string;
  beneficiario_id: string;
  tipo_documento: TipoDocumentoIdentidad | null;
  numero_documento: string | null;
  nombres: string | null;
  apellidos: string | null;
  parentesco: string | null;
  celular: string | null;
  correo: string | null;
  actualizado_en: string;
}

export interface ConsentimientoFila {
  id: string;
  usuario_id: string;
  version_texto: number;
  aceptado_en: string;
  ip: string | null;
  es_menor_al_aceptar: boolean;
}

/** Perfil completo que recibe el titular y el administrador. */
export interface PerfilBeneficiario {
  beneficiario: BeneficiarioFila | null;
  acudiente: AcudienteFila | null;
  email: string;
  activo: boolean;
  es_menor: boolean;
  perfil_completo: boolean;
  campos_faltantes: string[];
  consentimiento_vigente: { version: number; aceptado: boolean; aceptado_en: string | null };
}

/** Fila de la vista beneficiario_cuenta. */
export interface BeneficiarioCuenta {
  id: string;
  usuario_id: string;
  email: string;
  activo: boolean;
  ultimo_login: string | null;
  tipo_documento: TipoDocumentoIdentidad | null;
  numero_documento: string | null;
  nombres: string | null;
  apellidos: string | null;
  fecha_nacimiento: string | null;
  es_menor: boolean;
  perfil_completo: boolean;
  anonimizado: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface SolicitudHabeasData {
  id: string;
  usuario_id: string;
  tipo: 'ACCESO' | 'RECTIFICACION' | 'SUPRESION';
  detalle: string;
  estado: 'RADICADA' | 'RESUELTA' | 'RECHAZADA';
  motivo_resolucion: string | null;
  resuelta_por: string | null;
  creada_en: string;
  resuelta_en: string | null;
  /** Solo en la bandeja del administrador. */
  email?: string;
  nombre?: string | null;
}
