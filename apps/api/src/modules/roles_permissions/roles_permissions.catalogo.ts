import { ALCANCES_PERMISO, type AlcancePermiso, type Permiso, type Rol } from '@foest/shared';

/**
 * Metadatos del catalogo de roles y permisos (descripcion, categoria, alcance,
 * regla de alcance). Replica en TypeScript el seed de `public.rol` y
 * `public.permiso` de supabase/migrations/0001_base.sql para que la API pueda
 * responder sin consultar la base y para que la web muestre la matriz con su
 * contexto. La prueba `roles_permissions.test.ts` verifica que ambos coincidan.
 *
 * La CONCESION (rol -> permiso) NO vive aqui: es MATRIZ_PERMISOS de @foest/shared
 * (reexportada por apps/api/src/shared/rbac.matrix.ts).
 */
export interface MetaPermiso {
  categoria: string;
  alcance: AlcancePermiso;
  descripcion: string;
  /** Texto de la columna "Regla de alcance" de docs/modules/roles_permissions.md. */
  regla_alcance: string;
}

export const DESCRIPCION_ROL: Readonly<Record<Rol, string>> = {
  ADMINISTRADOR: 'Gestiona y supervisa la plataforma; no evalua',
  FUNCIONARIO: 'Evalua expedientes con asignacion activa propia',
  BENEFICIARIO: 'Estudiante que presenta postulaciones',
};

/** Orden de presentacion de las categorias (agrupacion de la matriz oficial). */
export const ORDEN_CATEGORIAS: readonly string[] = [
  'CUENTAS',
  'CONVOCATORIAS',
  'CATALOGOS',
  'POSTULACIONES',
  'DOCUMENTOS',
  'EVALUACION',
  'LABOR_SOCIAL',
  'SEGUIMIENTO',
  'NOTIFICACIONES',
  'DASHBOARDS',
  'REPORTES',
  'AUDITORIA',
  'SEGURIDAD',
];

export const TITULO_CATEGORIA: Readonly<Record<string, string>> = {
  CUENTAS: 'Cuentas, perfiles y habeas data',
  CONVOCATORIAS: 'Convocatorias',
  CATALOGOS: 'Catalogos y configuracion',
  POSTULACIONES: 'Postulaciones',
  DOCUMENTOS: 'Documentos y formatos',
  EVALUACION: 'Asignacion y evaluacion',
  LABOR_SOCIAL: 'Labor social',
  SEGUIMIENTO: 'Seguimiento de beneficios',
  NOTIFICACIONES: 'Notificaciones',
  DASHBOARDS: 'Dashboards',
  REPORTES: 'Reportes',
  AUDITORIA: 'Auditoria',
  SEGURIDAD: 'Seguridad',
};

const m = (categoria: string, alcance: AlcancePermiso, descripcion: string, regla_alcance: string): MetaPermiso => ({
  categoria,
  alcance,
  descripcion,
  regla_alcance,
});

/**
 * `Partial` a proposito: si otro modulo agrega un permiso a @foest/shared sin
 * tocar este archivo, el typecheck no se rompe; la prueba de consistencia con
 * el SQL si falla y senala el faltante.
 */
export const META_PERMISOS: Readonly<Partial<Record<Permiso, MetaPermiso>>> = {
  // Cuentas, perfiles y habeas data
  'funcionario:crear': m('CUENTAS', 'GLOBAL', 'Crear funcionario por invitacion', 'Global'),
  'funcionario:editar': m('CUENTAS', 'GLOBAL', 'Editar datos institucionales del funcionario', 'Global'),
  'funcionario:estado': m('CUENTAS', 'GLOBAL', 'Activar/deshabilitar funcionario', 'Global'),
  'funcionario:restablecer_clave': m('CUENTAS', 'GLOBAL', 'Restablecimiento manual de clave', 'Global'),
  'funcionario:consultar': m('CUENTAS', 'GLOBAL', 'Consultar funcionarios', 'Global'),
  'administrador:consultar': m('CUENTAS', 'GLOBAL', 'Listar cuentas administradoras', 'Global; protege al ultimo administrador'),
  'administrador:estado': m('CUENTAS', 'GLOBAL', 'Activar/deshabilitar administrador (protege al ultimo)', 'Global; protege al ultimo administrador'),
  'beneficiario:consultar': m('CUENTAS', 'ASIGNADO', 'Admin: global; funcionario: solo con asignacion propia', 'Administrador: lectura global. Funcionario: solo con asignacion propia activa o historica'),
  'beneficiario:editar_perfil': m('CUENTAS', 'PROPIO', 'Editar el perfil propio (/beneficiarios/me)', 'Solo el titular (/beneficiarios/me)'),
  'beneficiario:estado': m('CUENTAS', 'GLOBAL', 'Deshabilitar/reactivar beneficiario con motivo', 'Global, con motivo y auditoria'),
  'beneficiario:corregir_documento': m('CUENTAS', 'GLOBAL', 'Corregir documento de identidad con motivo', 'Global, con motivo y auditoria'),
  'habeas_data:solicitar': m('CUENTAS', 'PROPIO', 'Radicar solicitud de habeas data', 'Solo el titular'),
  'habeas_data:gestionar': m('CUENTAS', 'GLOBAL', 'Resolver solicitudes de habeas data', 'Global'),
  // Convocatorias y catalogos
  'convocatoria:crear': m('CONVOCATORIAS', 'GLOBAL', 'Crear convocatoria', 'Global'),
  'convocatoria:editar': m('CONVOCATORIAS', 'GLOBAL', 'Editar convocatoria', 'Global'),
  'convocatoria:habilitar': m('CONVOCATORIAS', 'GLOBAL', 'Habilitar convocatoria', 'Global'),
  'convocatoria:deshabilitar': m('CONVOCATORIAS', 'GLOBAL', 'Suspender convocatoria con motivo', 'Global; con motivo'),
  'convocatoria:rehabilitar': m('CONVOCATORIAS', 'GLOBAL', 'Rehabilitar convocatoria suspendida', 'Global; con motivo'),
  'convocatoria:ampliar': m('CONVOCATORIAS', 'GLOBAL', 'Prorrogar o reabrir con motivo', 'Exclusivo del Administrador, con motivo, solo CERRADA antes de archivar'),
  'convocatoria:archivar': m('CONVOCATORIAS', 'GLOBAL', 'Archivar convocatoria cerrada', 'Solo si todas las postulaciones estan en estado terminal'),
  'convocatoria:comite': m('CONVOCATORIAS', 'GLOBAL', 'Asignar/retirar funcionarios del comite', 'Asignar o retirar funcionarios del comite'),
  'convocatoria:consultar': m('CONVOCATORIAS', 'COMITE', 'Beneficiario: abiertas; funcionario: su comite; admin: todas', 'Beneficiario: solo HABILITADA vigente. Funcionario: las de su comite. Administrador: todas'),
  'catalogo:consultar': m('CATALOGOS', 'PUBLICO', 'Lectura de catalogos', 'Publico autenticado (lectura)'),
  'catalogo:administrar': m('CATALOGOS', 'GLOBAL', 'Administrar catalogos', 'Beneficios, festivos, tipos de documento y requisitos'),
  'configuracion:consultar': m('CATALOGOS', 'GLOBAL', 'Consultar configuracion (funcionario: no sensible)', 'Funcionario: solo parametros no sensibles'),
  'configuracion:editar': m('CATALOGOS', 'GLOBAL', 'Editar configuracion con auditoria', 'Global, con auditoria'),
  // Postulaciones, documentos y formatos
  'postulacion:crear': m('POSTULACIONES', 'PROPIO', 'Crear postulacion propia', 'Solo el titular'),
  'postulacion:editar': m('POSTULACIONES', 'PROPIO', 'Editar borrador / campos observados', 'Solo el titular'),
  'postulacion:enviar': m('POSTULACIONES', 'PROPIO', 'Enviar postulacion', 'Solo el titular'),
  'postulacion:subsanar': m('POSTULACIONES', 'PROPIO', 'Subsanar postulacion', 'Solo el titular'),
  'postulacion:desistir': m('POSTULACIONES', 'PROPIO', 'Desistir postulacion', 'Solo el titular'),
  'postulacion:eliminar_borrador': m('POSTULACIONES', 'PROPIO', 'Eliminar borrador', 'Solo el titular'),
  'postulacion:consultar': m('POSTULACIONES', 'ASIGNADO', 'Admin: todas; funcionario: asignadas; beneficiario: propias', 'Administrador: todas (auditado). Funcionario: asignacion propia activa o historica. Beneficiario: propias'),
  'documento:subir': m('DOCUMENTOS', 'PROPIO', 'Subir soporte', 'Titular, solo en BORRADOR o EN_CORRECCION dentro del plazo'),
  'documento:reemplazar': m('DOCUMENTOS', 'PROPIO', 'Reemplazar soporte', 'Titular, solo en BORRADOR o EN_CORRECCION dentro del plazo'),
  'documento:eliminar': m('DOCUMENTOS', 'PROPIO', 'Eliminar soporte', 'Titular, solo en BORRADOR o EN_CORRECCION dentro del plazo'),
  'documento:consultar': m('DOCUMENTOS', 'ASIGNADO', 'URL firmada tras verificar alcance; auditado', 'URL prefirmada de 300 s tras verificar alcance; cada entrega se audita'),
  'formato:generar': m('DOCUMENTOS', 'PROPIO', 'Generar GE-F041 y GE-F043', 'Solo el titular (GE-F041, GE-F043)'),
  // Asignacion y evaluacion
  'asignacion:bandeja': m('EVALUACION', 'COMITE', 'Bandeja minima del pool PENDIENTE', 'Resumen minimo del pool PENDIENTE de sus convocatorias y asignaciones propias'),
  'asignacion:tomar': m('EVALUACION', 'COMITE', 'Tomar expediente', 'Miembro del comite de la convocatoria'),
  'asignacion:liberar': m('EVALUACION', 'ASIGNADO', 'Liberar expediente', 'Miembro del comite de la convocatoria'),
  'asignacion:conflicto_interes': m('EVALUACION', 'ASIGNADO', 'Declarar conflicto de interes', 'Miembro del comite de la convocatoria'),
  'asignacion:reasignar': m('EVALUACION', 'GLOBAL', 'Reasignar individual o masivo', 'Individual y masiva; con motivo'),
  'asignacion:consultar': m('EVALUACION', 'GLOBAL', 'Consultar carga y alertas de asignaciones', 'Global (estado de carga y alertas por inactividad)'),
  'evaluacion:revisar': m('EVALUACION', 'ASIGNADO', 'Revisar expediente asignado', 'Solo el titular de la asignacion ACTIVA; excluido o ajeno responde 404'),
  'evaluacion:dictaminar': m('EVALUACION', 'ASIGNADO', 'Emitir dictamen (titular de asignacion ACTIVA)', 'Solo el titular de la asignacion ACTIVA; excluido o ajeno responde 404'),
  'evaluacion:consultar': m('EVALUACION', 'ASIGNADO', 'Admin: global; funcionario: sus asignaciones', 'Administrador: global (lectura). Funcionario: sus asignaciones'),
  // Labor social, seguimiento y notificaciones
  'labor_social:consultar': m('LABOR_SOCIAL', 'COMITE', 'Beneficiario: propia; funcionario: comite; admin: global', 'Beneficiario: propia. Funcionario: de su comite. Administrador: global'),
  'labor_social:registrar': m('LABOR_SOCIAL', 'PROPIO', 'Registrar horas de labor social', 'Solo el titular con beneficio de labor social vigente'),
  'labor_social:validar': m('LABOR_SOCIAL', 'COMITE', 'Validar horas registradas', 'Funcionario del comite de la convocatoria'),
  'labor_social:gestionar': m('LABOR_SOCIAL', 'GLOBAL', 'Correcciones y cierre', 'Global (correcciones y cierre)'),
  'seguimiento:consultar': m('SEGUIMIENTO', 'PROPIO', 'Beneficiario: sus otorgamientos; admin: global', 'Beneficiario: sus otorgamientos. Administrador: global'),
  'seguimiento:desembolsar': m('SEGUIMIENTO', 'GLOBAL', 'Registrar desembolsos (descifra datos de pago, auditado)', 'Unico punto de descifrado de datos de pago; auditado'),
  'seguimiento:revocar': m('SEGUIMIENTO', 'GLOBAL', 'Revocar otorgamiento con motivo', 'Con motivo y auditoria'),
  'seguimiento:suspender': m('SEGUIMIENTO', 'GLOBAL', 'Suspender otorgamiento con motivo', 'Con motivo y auditoria'),
  'notificacion:consultar': m('NOTIFICACIONES', 'PROPIO', 'Consultar notificaciones propias', 'Solo las propias (cualquier usuario)'),
  'notificacion:marcar_leida': m('NOTIFICACIONES', 'PROPIO', 'Marcar notificaciones propias como leidas', 'Solo las propias (cualquier usuario)'),
  'notificacion:administrar': m('NOTIFICACIONES', 'GLOBAL', 'Plantillas, outbox y reintentos', 'Plantillas, estado del outbox y reintentos'),
  // Dashboards, reportes y auditoria
  'dashboard:beneficiario': m('DASHBOARDS', 'PROPIO', 'Portal del beneficiario', 'Datos propios'),
  'dashboard:funcionario': m('DASHBOARDS', 'COMITE', 'Metricas del comite propio', 'Carga propia y promedio del comite; sin comparativa nominal'),
  'dashboard:admin': m('DASHBOARDS', 'GLOBAL', 'Panel gerencial', 'Global, incluida la comparativa nominal por evaluador'),
  'reportes:solicitar': m('REPORTES', 'COMITE', 'Admin: global; funcionario: su comite', 'Administrador: global. Funcionario: convocatorias de su comite'),
  'reportes:descargar': m('REPORTES', 'PROPIO', 'Solo reportes solicitados por el propio usuario', 'Solo reportes solicitados por el propio usuario'),
  'reportes:exportar_sensible': m('REPORTES', 'GLOBAL', 'Incluir estrato, SISBEN y documento en consolidados', 'Solo administrador; sin este permiso los consolidados omiten las columnas sensibles'),
  'auditoria:consultar': m('AUDITORIA', 'GLOBAL', 'Consultar bitacora', 'Global'),
  'auditoria:exportar': m('AUDITORIA', 'GLOBAL', 'Exportar bitacora (genera EXPORTACION)', 'Global; la exportacion genera EXPORTACION'),
  // Seguridad
  'rol:consultar': m('SEGURIDAD', 'GLOBAL', 'Consultar roles, catalogo de permisos y matriz rol x permiso', 'Global (solo lectura; los roles base son inmutables)'),
};

const META_DEFECTO: MetaPermiso = {
  categoria: 'OTROS',
  alcance: ALCANCES_PERMISO[0],
  descripcion: '',
  regla_alcance: '',
};

export function metaDe(codigo: Permiso): MetaPermiso {
  return META_PERMISOS[codigo] ?? META_DEFECTO;
}
