import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { PublicLayout } from './components/layout/PublicLayout';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './lib/auth/ProtectedRoute';
import { EnConstruccionPage, ForbiddenPage, NotFoundPage } from './pages/ErrorPages';
import { rutasDe } from './modules';

/**
 * Enrutador: rutas base + rutas aportadas por cada modulo (src/modules/index.ts).
 * Los arboles por rol envuelven con ProtectedRoute (redirige a /login o /403) y AppShell.
 */
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      // /convocatorias y /convocatorias/:id: modulo convocatorias (rutasPublicas)
      // / y /login (inicio de sesion), /registro, /recuperar, /restablecer, /verificar-correo, /invitacion y /cambiar-clave: modulo auth (rutasPublicas)
      { path: '/403', element: <ForbiddenPage /> },
      ...rutasDe('rutasPublicas'),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: <ProtectedRoute roles={['BENEFICIARIO']} />,
    children: [
      {
        path: '/beneficiario',
        element: <AppShell />,
        children: [
          // Pagina de inicio (/beneficiario): modulo beneficiario_dashboard (rutasBeneficiario, index)
          ...rutasDe('rutasBeneficiario'),
          { path: '*', element: <EnConstruccionPage modulo="Modulo en construccion" /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute roles={['FUNCIONARIO']} />,
    children: [
      {
        path: '/funcionario',
        element: <AppShell />,
        children: [
          // La pagina de inicio del funcionario la aporta el modulo dashboard_funcionario (index en rutasFuncionario).
          ...rutasDe('rutasFuncionario'),
          { path: '*', element: <EnConstruccionPage modulo="Modulo en construccion" /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute roles={['ADMINISTRADOR']} />,
    children: [
      {
        path: '/admin',
        element: <AppShell />,
        children: [
          // El indice de /admin lo aporta el modulo admin_dashboard (AdminPanelPage).
          ...rutasDe('rutasAdmin'),
          { path: '*', element: <EnConstruccionPage modulo="Modulo en construccion" /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
