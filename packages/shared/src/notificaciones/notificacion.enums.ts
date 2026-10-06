/**
 * Enums del modulo `notificaciones` (docs/modules/notificaciones.md).
 * Lista cerrada de tipos; cada tipo declara canales, severidad y categoria
 * (la categoria decide si el correo puede desactivarse por preferencia).
 */

export const SEVERIDADES_NOTIFICACION = ['INFO', 'ADVERTENCIA', 'CRITICA'] as const;
export type SeveridadNotificacion = (typeof SEVERIDADES_NOTIFICACION)[number];

export const ESTADOS_OUTBOX = ['PENDIENTE', 'EN_PROCESO', 'ENVIADO', 'FALLIDO', 'MUERTO', 'SUPRIMIDO'] as const;
export type EstadoOutbox = (typeof ESTADOS_OUTBOX)[number];

export const ESTADOS_ENTREGA_CORREO = ['ENVIADO', 'ENTREGADO', 'REBOTADO', 'QUEJA', 'FALLIDO'] as const;
export type EstadoEntregaCorreo = (typeof ESTADOS_ENTREGA_CORREO)[number];

export const ROLES_DESTINATARIO = ['PRINCIPAL', 'ALTERNATIVO', 'ACUDIENTE'] as const;
export type RolDestinatario = (typeof ROLES_DESTINATARIO)[number];

export const CODIGOS_REBOTE = ['HARD', 'SOFT'] as const;
export type CodigoRebote = (typeof CODIGOS_REBOTE)[number];

export const MOTIVOS_SUPRESION = ['REBOTE_DURO', 'QUEJA', 'MANUAL'] as const;
export type MotivoSupresion = (typeof MOTIVOS_SUPRESION)[number];

export const CANALES_NOTIFICACION = ['APP', 'CORREO'] as const;
export type CanalNotificacion = (typeof CANALES_NOTIFICACION)[number];

export const ENTIDADES_NOTIFICACION = ['POSTULACION', 'CONVOCATORIA', 'OTORGAMIENTO', 'REPORTE', 'ASIGNACION', 'USUARIO'] as const;
export type EntidadNotificacion = (typeof ENTIDADES_NOTIFICACION)[number];

/**
 * Categoria de un tipo:
 *  - SEGURIDAD: solo correo, sin buzon, no desactivable (verificacion, clave, bloqueo).
 *  - OBLIGATORIO: correo no desactivable (plazos y derechos: correccion, resultados, otorgamientos).
 *  - RECORDATORIO: desactivable con `correo_recordatorios`.
 *  - INFORMATIVO: desactivable con `correo_informativos`.
 *  - INTERNO: avisos a funcionarios/administradores.
 */
export const CATEGORIAS_TIPO_NOTIFICACION = ['SEGURIDAD', 'OBLIGATORIO', 'RECORDATORIO', 'INFORMATIVO', 'INTERNO'] as const;
export type CategoriaTipoNotificacion = (typeof CATEGORIAS_TIPO_NOTIFICACION)[number];

export const TIPOS_NOTIFICACION = [
  'POSTULACION_ENVIADA',
  'POSTULACION_EN_REVISION',
  'CORRECCION_SOLICITADA',
  'POSTULACION_APROBADA',
  'POSTULACION_RECHAZADA',
  'SUBSANACION_POR_VENCER',
  'RECORDATORIO_BORRADOR',
  'POSTULACION_DESISTIDA',
  'CONVOCATORIA_ABIERTA',
  'CONVOCATORIA_SUSPENDIDA',
  'CONVOCATORIA_POR_CERRAR',
  'OTORGAMIENTO_REGISTRADO',
  'OTORGAMIENTO_SUSPENDIDO',
  'OTORGAMIENTO_REVOCADO',
  'DESEMBOLSO_PAGADO',
  'LABOR_SOCIAL_REGISTRADA',
  'ASIGNACION_NUEVA',
  'ASIGNACION_REASIGNADA',
  'ASIGNACION_SIN_MOVIMIENTO',
  'COMITE_CAMBIADO',
  'ALERTA_SOBRECARGA',
  'REPORTE_LISTO',
  'REPORTE_FALLIDO',
  'INVITACION_FUNCIONARIO',
  'VERIFICACION_CORREO',
  'RESTABLECER_CLAVE',
  'BLOQUEO_POR_INTENTOS',
  'CAMBIO_CLAVE_CONFIRMACION',
  'CUENTA_DESHABILITADA',
  'SISTEMA',
] as const;
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];

export interface DefinicionTipoNotificacion {
  canales: readonly CanalNotificacion[];
  severidad: SeveridadNotificacion;
  categoria: CategoriaTipoNotificacion;
  /** Texto corto para listados administrativos. */
  etiqueta: string;
}

export const CATALOGO_TIPOS_NOTIFICACION: Readonly<Record<TipoNotificacion, DefinicionTipoNotificacion>> = {
  POSTULACION_ENVIADA: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'INFORMATIVO', etiqueta: 'Postulacion enviada' },
  POSTULACION_EN_REVISION: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'INFORMATIVO', etiqueta: 'Postulacion en revision' },
  CORRECCION_SOLICITADA: { canales: ['APP', 'CORREO'], severidad: 'ADVERTENCIA', categoria: 'OBLIGATORIO', etiqueta: 'Correccion solicitada' },
  POSTULACION_APROBADA: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'OBLIGATORIO', etiqueta: 'Postulacion aprobada' },
  POSTULACION_RECHAZADA: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'OBLIGATORIO', etiqueta: 'Postulacion rechazada' },
  SUBSANACION_POR_VENCER: { canales: ['APP', 'CORREO'], severidad: 'ADVERTENCIA', categoria: 'OBLIGATORIO', etiqueta: 'Subsanacion por vencer' },
  RECORDATORIO_BORRADOR: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'RECORDATORIO', etiqueta: 'Recordatorio de borrador' },
  POSTULACION_DESISTIDA: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'INFORMATIVO', etiqueta: 'Postulacion desistida' },
  CONVOCATORIA_ABIERTA: { canales: ['CORREO'], severidad: 'INFO', categoria: 'RECORDATORIO', etiqueta: 'Convocatoria abierta' },
  CONVOCATORIA_SUSPENDIDA: { canales: ['APP', 'CORREO'], severidad: 'ADVERTENCIA', categoria: 'INFORMATIVO', etiqueta: 'Convocatoria suspendida' },
  CONVOCATORIA_POR_CERRAR: { canales: ['APP', 'CORREO'], severidad: 'ADVERTENCIA', categoria: 'INTERNO', etiqueta: 'Convocatoria por cerrar' },
  OTORGAMIENTO_REGISTRADO: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'OBLIGATORIO', etiqueta: 'Otorgamiento registrado' },
  OTORGAMIENTO_SUSPENDIDO: { canales: ['APP', 'CORREO'], severidad: 'ADVERTENCIA', categoria: 'OBLIGATORIO', etiqueta: 'Otorgamiento suspendido' },
  OTORGAMIENTO_REVOCADO: { canales: ['APP', 'CORREO'], severidad: 'ADVERTENCIA', categoria: 'OBLIGATORIO', etiqueta: 'Otorgamiento revocado' },
  DESEMBOLSO_PAGADO: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'OBLIGATORIO', etiqueta: 'Desembolso pagado' },
  LABOR_SOCIAL_REGISTRADA: { canales: ['APP'], severidad: 'INFO', categoria: 'INFORMATIVO', etiqueta: 'Labor social registrada' },
  ASIGNACION_NUEVA: { canales: ['APP'], severidad: 'INFO', categoria: 'INTERNO', etiqueta: 'Asignacion nueva' },
  ASIGNACION_REASIGNADA: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'INTERNO', etiqueta: 'Expediente reasignado' },
  ASIGNACION_SIN_MOVIMIENTO: { canales: ['APP'], severidad: 'ADVERTENCIA', categoria: 'INTERNO', etiqueta: 'Asignacion sin movimiento' },
  COMITE_CAMBIADO: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'INTERNO', etiqueta: 'Comite cambiado' },
  ALERTA_SOBRECARGA: { canales: ['APP'], severidad: 'ADVERTENCIA', categoria: 'INTERNO', etiqueta: 'Alerta de sobrecarga' },
  REPORTE_LISTO: { canales: ['APP', 'CORREO'], severidad: 'INFO', categoria: 'INTERNO', etiqueta: 'Reporte listo' },
  REPORTE_FALLIDO: { canales: ['APP'], severidad: 'ADVERTENCIA', categoria: 'INTERNO', etiqueta: 'Reporte fallido' },
  INVITACION_FUNCIONARIO: { canales: ['CORREO'], severidad: 'INFO', categoria: 'SEGURIDAD', etiqueta: 'Invitacion de funcionario' },
  VERIFICACION_CORREO: { canales: ['CORREO'], severidad: 'INFO', categoria: 'SEGURIDAD', etiqueta: 'Verificacion de correo' },
  RESTABLECER_CLAVE: { canales: ['CORREO'], severidad: 'CRITICA', categoria: 'SEGURIDAD', etiqueta: 'Restablecer clave' },
  BLOQUEO_POR_INTENTOS: { canales: ['CORREO'], severidad: 'CRITICA', categoria: 'SEGURIDAD', etiqueta: 'Bloqueo por intentos' },
  CAMBIO_CLAVE_CONFIRMACION: { canales: ['CORREO'], severidad: 'CRITICA', categoria: 'SEGURIDAD', etiqueta: 'Cambio de clave' },
  CUENTA_DESHABILITADA: { canales: ['CORREO'], severidad: 'ADVERTENCIA', categoria: 'OBLIGATORIO', etiqueta: 'Cuenta deshabilitada' },
  SISTEMA: { canales: ['APP'], severidad: 'ADVERTENCIA', categoria: 'INTERNO', etiqueta: 'Aviso del sistema' },
};

export function esTipoNotificacion(valor: string): valor is TipoNotificacion {
  return (TIPOS_NOTIFICACION as readonly string[]).includes(valor);
}

/** Tipos que solo van por correo (sin buzon in-app). */
export function tipoTieneBuzon(tipo: TipoNotificacion): boolean {
  return CATALOGO_TIPOS_NOTIFICACION[tipo].canales.includes('APP');
}

export function tipoEnviaCorreo(tipo: TipoNotificacion): boolean {
  return CATALOGO_TIPOS_NOTIFICACION[tipo].canales.includes('CORREO');
}

/** `true` si el usuario puede desactivar el correo de este tipo con sus preferencias. */
export function tipoCorreoDesactivable(tipo: TipoNotificacion): boolean {
  const c = CATALOGO_TIPOS_NOTIFICACION[tipo].categoria;
  return c === 'RECORDATORIO' || c === 'INFORMATIVO';
}
