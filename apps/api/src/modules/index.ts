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
import { documentoRouter } from './documentos/documento.routes';
import { formatoRouter } from './formatos_oficiales/formato.routes';

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
  { prefijo: '/', router: documentoRouter },
  { prefijo: '/', router: formatoRouter },
];

export function registrarModulos(app: Express, apiPrefix: string): void {
  for (const m of modulos) {
    app.use(`${apiPrefix}${m.prefijo}`, m.router);
  }
}
