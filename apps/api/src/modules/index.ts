import type { Express, Router } from 'express';
import { ejemploRoutes } from './ejemplo/ejemplo.routes';
import { authRoutes } from './auth/auth.routes';
import { rolesRoutes, permisosRoutes } from './roles_permissions/roles_permissions.routes';
import { adminDashboardRoutes } from './admin_dashboard/admin_dashboard.routes';
import { configuracionRoutes, festivosRoutes, catalogosRoutes, catalogosAdminRoutes } from './catalogos_configuracion/catalogos_configuracion.routes';
import { auditoriaRoutes } from './auditoria/auditoria.routes';
import { dashboardFuncionarioRoutes } from './dashboard_funcionario/dashboard_funcionario.routes';
import { funcionariosRoutes, administradoresRoutes, beneficiariosRoutes, habeasDataRoutes } from './accounts/accounts.routes';
import { beneficiarioDashboardRoutes } from './beneficiario_dashboard/beneficiario_dashboard.routes';
import { notificacionesRoutes } from './notificaciones/notificaciones.routes';
import { convocatoriasRoutes, convocatoriasPublicoRoutes, beneficiosRoutes } from './convocatorias/convocatorias.routes';
import { postulacionesRoutes } from './postulaciones/postulaciones.routes';
import { documentosRoutes, documentosPostulacionRoutes, tiposDocumentoRoutes, documentosConvocatoriaRoutes } from './documentos';
import { formatosRoutes, formatosPostulacionRoutes, formatosPublicoRoutes } from './formatos_oficiales';
import { asignacionesRoutes } from './asignaciones';
import { evaluacionRoutes } from './evaluacion';
import { exportReportsRoutes } from './export_reports';
import { seguimientoRoutes } from './seguimiento_beneficios';
import { laborSocialRoutes, laborSocialBeneficiarioRoutes } from './labor_social';

/**
 * Registro de routers por modulo.
 *
 * Convencion (README-DEV.md):
 *   src/modules/<modulo>/<modulo>.routes.ts  ->  `export const <modulo>Routes: Router`
 *   y se agrega aqui una entrada `{ prefijo: '/<recurso>', router: <modulo>Routes }`.
 *
 * El prefijo se monta bajo `/api/v1`. Un modulo puede exponer varios prefijos
 * (p. ej. convocatorias monta `/convocatorias`, `/publico/convocatorias` y `/beneficios`).
 */
export interface ModuloRegistrado {
  prefijo: `/${string}`;
  router: Router;
}

export const modulos: ModuloRegistrado[] = [
  // Ejemplo de referencia (eliminar cuando exista el primer modulo real):
  { prefijo: '/ejemplo', router: ejemploRoutes },
  { prefijo: '/auth', router: authRoutes },
  { prefijo: '/roles', router: rolesRoutes },
  { prefijo: '/permisos', router: permisosRoutes },
  { prefijo: '/dashboard/admin', router: adminDashboardRoutes },
  { prefijo: '/auditoria', router: auditoriaRoutes },
  { prefijo: '/configuracion', router: configuracionRoutes },
  { prefijo: '/festivos', router: festivosRoutes },
  { prefijo: '/catalogos', router: catalogosRoutes },
  { prefijo: '/admin/catalogos', router: catalogosAdminRoutes },
  { prefijo: '/dashboard/funcionario', router: dashboardFuncionarioRoutes },
  { prefijo: '/funcionarios', router: funcionariosRoutes },
  { prefijo: '/administradores', router: administradoresRoutes },
  { prefijo: '/beneficiarios', router: beneficiariosRoutes },
  { prefijo: '/habeas-data', router: habeasDataRoutes },
  { prefijo: '/dashboard/beneficiario', router: beneficiarioDashboardRoutes },
  { prefijo: '/notificaciones', router: notificacionesRoutes },
  { prefijo: '/convocatorias', router: convocatoriasRoutes },
  { prefijo: '/publico/convocatorias', router: convocatoriasPublicoRoutes },
  { prefijo: '/beneficios', router: beneficiosRoutes },
  { prefijo: '/postulaciones', router: postulacionesRoutes },
  // documentos: soportes (rutas /postulaciones/:id/documentos..., /documentos, /tipos-documento, /convocatorias/:id/requisitos-documentos)
  { prefijo: '/postulaciones', router: documentosPostulacionRoutes },
  { prefijo: '/documentos', router: documentosRoutes },
  { prefijo: '/tipos-documento', router: tiposDocumentoRoutes },
  { prefijo: '/convocatorias', router: documentosConvocatoriaRoutes },
  // formatos_oficiales: GE-F041 / GE-F043 (generar y listar por postulacion, metadatos y descarga, verificacion publica)
  { prefijo: '/postulaciones', router: formatosPostulacionRoutes },
  { prefijo: '/formatos', router: formatosRoutes },
  { prefijo: '/publico/verificar', router: formatosPublicoRoutes },
  { prefijo: '/asignaciones', router: asignacionesRoutes },
  { prefijo: '/evaluacion', router: evaluacionRoutes },
  // export_reports: resumen.pdf, consolidados HTML/CSV, jobs, mis reportes y descarga
  { prefijo: '/reportes', router: exportReportsRoutes },
  // seguimiento_beneficios: otorgamientos, desembolsos, cupos y vista del beneficiario
  { prefijo: '/seguimiento', router: seguimientoRoutes },
  // labor_social: certificados y actividades; GET /beneficiarios/:beneficiarioId/labor-social (2 segmentos, sin choque con /:id de accounts)
  { prefijo: '/labor-social', router: laborSocialRoutes },
  { prefijo: '/beneficiarios', router: laborSocialBeneficiarioRoutes },
];

export function registrarModulos(app: Express, apiPrefix: string): void {
  for (const m of modulos) {
    app.use(`${apiPrefix}${m.prefijo}`, m.router);
  }
}
