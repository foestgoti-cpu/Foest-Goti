import { z } from 'zod';
import type { Rol } from './enums';

/**
 * Codigos de permiso `recurso:accion` tomados de docs/modules/roles_permissions.md
 * (Matriz Oficial de Permisos por Rol). Lista cerrada: agregar un permiso exige
 * actualizar este archivo, `apps/api/src/shared/rbac.matrix.ts` y el seed SQL de
 * `rol_permiso` en `supabase/migrations/0001_base.sql`.
 */
export const PERMISOS = [
  // Cuentas, perfiles y habeas data
  'funcionario:crear',
  'funcionario:editar',
  'funcionario:estado',
  'funcionario:restablecer_clave',
  'funcionario:consultar',
  'administrador:consultar',
  'administrador:estado',
  'beneficiario:consultar',
  'beneficiario:editar_perfil',
  'beneficiario:estado',
  'beneficiario:corregir_documento',
  'habeas_data:solicitar',
  'habeas_data:gestionar',
  // Convocatorias y catalogos
  'convocatoria:crear',
  'convocatoria:editar',
  'convocatoria:habilitar',
  'convocatoria:deshabilitar',
  'convocatoria:rehabilitar',
  'convocatoria:ampliar',
  'convocatoria:archivar',
  'convocatoria:comite',
  'convocatoria:consultar',
  'catalogo:consultar',
  'catalogo:administrar',
  'configuracion:consultar',
  'configuracion:editar',
  // Postulaciones, documentos y formatos
  'postulacion:crear',
  'postulacion:editar',
  'postulacion:enviar',
  'postulacion:subsanar',
  'postulacion:desistir',
  'postulacion:eliminar_borrador',
  'postulacion:consultar',
  'documento:subir',
  'documento:reemplazar',
  'documento:eliminar',
  'documento:consultar',
  'formato:generar',
  // Asignacion y evaluacion
  'asignacion:bandeja',
  'asignacion:tomar',
  'asignacion:liberar',
  'asignacion:conflicto_interes',
  'asignacion:reasignar',
  'asignacion:consultar',
  'evaluacion:revisar',
  'evaluacion:dictaminar',
  'evaluacion:consultar',
  // Labor social, seguimiento y notificaciones
  'labor_social:consultar',
  'labor_social:registrar',
  'labor_social:validar',
  'labor_social:gestionar',
  'seguimiento:consultar',
  'seguimiento:desembolsar',
  'seguimiento:revocar',
  'seguimiento:suspender',
  'notificacion:consultar',
  'notificacion:marcar_leida',
  'notificacion:administrar',
  // Dashboards, reportes y auditoria
  'dashboard:beneficiario',
  'dashboard:funcionario',
  'dashboard:admin',
  'reportes:solicitar',
  'reportes:descargar',
  'reportes:exportar_sensible',
  'auditoria:consultar',
  'auditoria:exportar',
  // Seguridad (modulo roles_permissions): consulta de roles, catalogo y matriz
  'rol:consultar',
] as const;

export const PermisoSchema = z.enum(PERMISOS);
export type Permiso = z.infer<typeof PermisoSchema>;

/** Regla de alcance de cada permiso (columna "Regla de alcance" de la matriz). */
export const ALCANCES_PERMISO = ['GLOBAL', 'ASIGNADO', 'PROPIO', 'COMITE', 'PUBLICO'] as const;
export type AlcancePermiso = (typeof ALCANCES_PERMISO)[number];

/**
 * Matriz rol -> permisos. Es la MISMA matriz que `apps/api/src/shared/rbac.matrix.ts`
 * reexporta y que el seed SQL replica en `rol_permiso`. El frontend la usa solo
 * para ergonomia (ocultar opciones); la autorizacion real ocurre en la API.
 */
export const MATRIZ_PERMISOS: Readonly<Record<Rol, readonly Permiso[]>> = {
  ADMINISTRADOR: [
    'funcionario:crear',
    'funcionario:editar',
    'funcionario:estado',
    'funcionario:restablecer_clave',
    'funcionario:consultar',
    'administrador:consultar',
    'administrador:estado',
    'beneficiario:consultar',
    'beneficiario:estado',
    'beneficiario:corregir_documento',
    'habeas_data:gestionar',
    'convocatoria:crear',
    'convocatoria:editar',
    'convocatoria:habilitar',
    'convocatoria:deshabilitar',
    'convocatoria:rehabilitar',
    'convocatoria:ampliar',
    'convocatoria:archivar',
    'convocatoria:comite',
    'convocatoria:consultar',
    'catalogo:consultar',
    'catalogo:administrar',
    'configuracion:consultar',
    'configuracion:editar',
    'postulacion:consultar',
    'documento:consultar',
    'asignacion:reasignar',
    'asignacion:consultar',
    'evaluacion:consultar',
    'labor_social:consultar',
    'labor_social:gestionar',
    'seguimiento:consultar',
    'seguimiento:desembolsar',
    'seguimiento:revocar',
    'seguimiento:suspender',
    'notificacion:consultar',
    'notificacion:marcar_leida',
    'notificacion:administrar',
    'dashboard:admin',
    'reportes:solicitar',
    'reportes:descargar',
    'reportes:exportar_sensible',
    'auditoria:consultar',
    'auditoria:exportar',
    'rol:consultar',
  ],
  FUNCIONARIO: [
    'beneficiario:consultar',
    'convocatoria:consultar',
    'catalogo:consultar',
    'configuracion:consultar',
    'postulacion:consultar',
    'documento:consultar',
    'asignacion:bandeja',
    'asignacion:tomar',
    'asignacion:liberar',
    'asignacion:conflicto_interes',
    'evaluacion:revisar',
    'evaluacion:dictaminar',
    'evaluacion:consultar',
    'labor_social:consultar',
    'labor_social:validar',
    'notificacion:consultar',
    'notificacion:marcar_leida',
    'dashboard:funcionario',
    'reportes:solicitar',
    'reportes:descargar',
  ],
  BENEFICIARIO: [
    'beneficiario:editar_perfil',
    'habeas_data:solicitar',
    'convocatoria:consultar',
    'catalogo:consultar',
    'postulacion:crear',
    'postulacion:editar',
    'postulacion:enviar',
    'postulacion:subsanar',
    'postulacion:desistir',
    'postulacion:eliminar_borrador',
    'postulacion:consultar',
    'documento:subir',
    'documento:reemplazar',
    'documento:eliminar',
    'documento:consultar',
    'formato:generar',
    'labor_social:consultar',
    'labor_social:registrar',
    'seguimiento:consultar',
    'notificacion:consultar',
    'notificacion:marcar_leida',
    'dashboard:beneficiario',
  ],
};

export const rolTienePermiso = (rol: Rol, permiso: Permiso): boolean =>
  MATRIZ_PERMISOS[rol].includes(permiso);
