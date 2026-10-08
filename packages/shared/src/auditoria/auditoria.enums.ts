import { z } from 'zod';

/**
 * Catalogo CERRADO de acciones y entidades de auditoria (docs/modules/auditoria.md),
 * ampliado con las acciones que ya emiten los modulos implementados (auth, accounts,
 * convocatorias, postulaciones, admin_dashboard). Agregar una accion exige PR.
 *
 * Lo comparten la API (validacion de filtros, catalogo) y el web (filtros del visor).
 */
export const ACCIONES_AUDITORIA = [
  // Ciclo de vida generico
  'CREAR',
  'ACTUALIZAR',
  'ELIMINAR',
  'DESHABILITAR',
  'REHABILITAR',
  // Convocatorias
  'HABILITAR',
  'AMPLIAR',
  'ARCHIVAR',
  'CERRAR',
  // Postulaciones
  'ENVIAR',
  'SUBSANAR',
  'DESISTIR',
  'TRANSICION_ESTADO',
  'LISTADO_POSTULACIONES',
  'POSTULACION_BORRADOR_ELIMINADO',
  // Asignaciones y evaluacion
  'TOMAR',
  'LIBERAR',
  'CONFLICTO_INTERES',
  'REASIGNAR',
  'DICTAMINAR',
  // Seguimiento de beneficios
  'SUSPENDER',
  'REVOCAR',
  'DESEMBOLSAR',
  'REACTIVAR',
  'CUMPLIR',
  'ANULAR',
  'CARGA_PAGOS',
  // Labor social
  'COMPLETAR',
  'REABRIR',
  'PRESENTAR',
  // Autenticacion y sesiones
  'LOGIN',
  'LOGIN_FALLIDO',
  'LOGOUT',
  'REFRESH_REUSO',
  'CAMBIO_CLAVE',
  'RESTABLECER_CLAVE',
  'REVOCAR_SESIONES',
  // Cuentas
  'INVITACION_EMITIDA',
  'INVITACION_ACEPTADA',
  'INVITACION_REENVIADA',
  'FUNCIONARIO_CREADO',
  'FUNCIONARIO_ACTUALIZADO',
  'PERFIL_ACTUALIZADO',
  'DOCUMENTO_IDENTIDAD_CORREGIDO',
  'CONSENTIMIENTO_ACEPTADO',
  'HABEAS_DATA_RADICADA',
  'HABEAS_DATA_RESUELTA',
  'ANONIMIZACION',
  // Datos sensibles, documentos y reportes
  'LECTURA_SENSIBLE',
  'DESCARGA_DOCUMENTO',
  'GENERAR_FORMATO',
  'EXPORTACION',
  // Sistema
  'CONFIGURACION',
  'NOTIFICAR',
  'ACCESO_DENEGADO',
  'VERIFICACION_INTEGRIDAD',
  'PURGA_RETENCION',
] as const;
export const AccionAuditoriaSchema = z.enum(ACCIONES_AUDITORIA);
export type AccionAuditoria = z.infer<typeof AccionAuditoriaSchema>;

export const ENTIDADES_AUDITORIA = [
  'USUARIO',
  'SESION',
  'INVITACION',
  'BENEFICIARIO',
  'FUNCIONARIO',
  'ROL_PERMISO',
  'CONSENTIMIENTO_DATOS',
  'SOLICITUD_HABEAS_DATA',
  'CONVOCATORIA',
  'CONVOCATORIA_BENEFICIO',
  'AMPLIACION_CONVOCATORIA',
  'ASIGNACION_FUNCIONARIO',
  'ASIGNACION',
  'POSTULACION',
  'POSTULACION_ENVIO',
  'DOCUMENTO',
  'FORMATO_GENERADO',
  'REVISION',
  'REVISION_BENEFICIO',
  'REVISION_DOCUMENTO',
  'OTORGAMIENTO',
  'DESEMBOLSO',
  'CERTIFICADO_LABOR_SOCIAL',
  'ACTIVIDAD_LABOR_SOCIAL',
  'REPORTE',
  'NOTIFICACION',
  'CONFIGURACION',
  'FESTIVO',
  'CATALOGO_SNIES',
  'DECLARACION_JURAMENTADA',
  'TEXTO_CONSENTIMIENTO',
  'AUDITORIA',
] as const;
export const EntidadAuditoriaSchema = z.enum(ENTIDADES_AUDITORIA);
export type EntidadAuditoria = z.infer<typeof EntidadAuditoriaSchema>;

export const RESULTADOS_AUDITORIA = ['EXITO', 'FALLO', 'DENEGADO'] as const;
export const ResultadoAuditoriaSchema = z.enum(RESULTADOS_AUDITORIA);
export type ResultadoAuditoria = z.infer<typeof ResultadoAuditoriaSchema>;

export const ACTORES_TIPO_AUDITORIA = ['USUARIO', 'SISTEMA', 'ANONIMO'] as const;
export const ActorTipoAuditoriaSchema = z.enum(ACTORES_TIPO_AUDITORIA);
export type ActorTipoAuditoria = z.infer<typeof ActorTipoAuditoriaSchema>;

/** Formatos de exportacion admitidos por `GET /auditoria/exportar`. */
export const FORMATOS_EXPORTACION_AUDITORIA = ['CSV'] as const;
export const FormatoExportacionAuditoriaSchema = z.enum(FORMATOS_EXPORTACION_AUDITORIA);
export type FormatoExportacionAuditoria = z.infer<typeof FormatoExportacionAuditoriaSchema>;

/** Origen de una verificacion de integridad registrada en `auditoria_integridad`. */
export const ORIGENES_VERIFICACION_AUDITORIA = ['JOB', 'MANUAL', 'MIGRACION', 'PURGA'] as const;
export type OrigenVerificacionAuditoria = (typeof ORIGENES_VERIFICACION_AUDITORIA)[number];

/** Rango maximo de una consulta/exportacion por solicitud (auditoria.md). */
export const RANGO_MAX_DIAS_AUDITORIA = 366;

/** Maximo de filas por exportacion CSV (el administrador debe acotar los filtros). */
export const EXPORTACION_MAX_FILAS_AUDITORIA = 10_000;

export function esAccionAuditoria(valor: string): valor is AccionAuditoria {
  return (ACCIONES_AUDITORIA as readonly string[]).includes(valor);
}

export function esEntidadAuditoria(valor: string): valor is EntidadAuditoria {
  return (ENTIDADES_AUDITORIA as readonly string[]).includes(valor);
}
