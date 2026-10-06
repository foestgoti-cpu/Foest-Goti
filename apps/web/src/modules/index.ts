import type { RouteObject } from 'react-router-dom';
import { ejemploRoutes } from './ejemplo/routes';
import { authRoutes } from './auth/routes';
import { rolesPermissionsRoutes } from './roles_permissions/routes';
import { dashboardFuncionarioRoutes } from './dashboard_funcionario/routes';
import { adminDashboardRoutes } from './admin_dashboard/routes';
import { auditoriaRoutes } from './auditoria/routes';
import { catalogosConfiguracionRoutes } from './catalogos_configuracion/routes';
import { beneficiarioDashboardRoutes } from './beneficiario_dashboard/routes';
import { convocatoriasRoutes } from './convocatorias/routes';
import { accountsRoutes } from './accounts/routes';
import { postulacionesRoutes } from './postulaciones/routes';
import { notificacionesRoutes } from './notificaciones/routes';

/**
 * Registro de rutas por modulo (README-DEV.md).
 *
 * Convencion: `src/modules/<modulo>/routes.tsx` exporta `export const <modulo>Routes: RouteObject[]`.
 * Cada modulo declara sus rutas RELATIVAS al arbol del rol donde se montan:
 *   - `rutasBeneficiario`: hijos de `/beneficiario` (AppShell, rol BENEFICIARIO)
 *   - `rutasFuncionario`:  hijos de `/funcionario`  (AppShell, rol FUNCIONARIO)
 *   - `rutasAdmin`:        hijos de `/admin`        (AppShell, rol ADMINISTRADOR)
 *   - `rutasPublicas`:     hijos de `/`             (PublicLayout, sin sesion)
 */
export interface RutasModulo {
  rutasPublicas?: RouteObject[];
  rutasBeneficiario?: RouteObject[];
  rutasFuncionario?: RouteObject[];
  rutasAdmin?: RouteObject[];
}

export const modulos: RutasModulo[] = [
  ejemploRoutes, // ejemplo de referencia; eliminar cuando exista el primer modulo real
  authRoutes,
  rolesPermissionsRoutes,
  dashboardFuncionarioRoutes,
  adminDashboardRoutes,
  auditoriaRoutes,
  catalogosConfiguracionRoutes,
  beneficiarioDashboardRoutes,
  convocatoriasRoutes,
  accountsRoutes,
  postulacionesRoutes,
  notificacionesRoutes,
];

export function rutasDe(clave: keyof RutasModulo): RouteObject[] {
  return modulos.flatMap((m) => m[clave] ?? []);
}
