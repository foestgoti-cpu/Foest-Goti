import type { Rol } from '@foest/shared';

/**
 * Navegacion lateral por rol. Cada modulo agrega sus entradas aqui
 * (sin iconos: diseno institucional sobrio).
 */
export interface ItemNavegacion {
  etiqueta: string;
  ruta: string;
  /** Coincidencia exacta (p. ej. la pagina de inicio del rol). */
  exacta?: boolean;
}

export interface GrupoNavegacion {
  titulo?: string;
  items: ItemNavegacion[];
}

export const NAVEGACION: Readonly<Record<Rol, GrupoNavegacion[]>> = {
  BENEFICIARIO: [
    {
      items: [
        { etiqueta: 'Inicio', ruta: '/beneficiario', exacta: true },
        { etiqueta: 'Mi perfil', ruta: '/beneficiario/perfil' },
        { etiqueta: 'Mis postulaciones', ruta: '/beneficiario/postulaciones' },
        { etiqueta: 'Notificaciones', ruta: '/beneficiario/notificaciones' },
      ],
    },
  ],
  FUNCIONARIO: [
    {
      items: [
        { etiqueta: 'Inicio', ruta: '/funcionario', exacta: true },
        { etiqueta: 'Bandeja de expedientes', ruta: '/funcionario/bandeja' },
        { etiqueta: 'Convocatorias', ruta: '/funcionario/convocatorias' },
        { etiqueta: 'Panel de metricas', ruta: '/funcionario/metricas' },
        { etiqueta: 'Notificaciones', ruta: '/funcionario/notificaciones' },
      ],
    },
  ],
  ADMINISTRADOR: [
    {
      titulo: 'Gestion',
      items: [
        { etiqueta: 'Panel', ruta: '/admin', exacta: true },
        { etiqueta: 'Convocatorias', ruta: '/admin/convocatorias' },
        { etiqueta: 'Postulaciones', ruta: '/admin/postulaciones' },
        { etiqueta: 'Asignaciones', ruta: '/admin/asignaciones' },
      ],
    },
    {
      titulo: 'Cuentas',
      items: [
        { etiqueta: 'Funcionarios', ruta: '/admin/funcionarios' },
        { etiqueta: 'Beneficiarios', ruta: '/admin/beneficiarios' },
        { etiqueta: 'Administradores', ruta: '/admin/administradores' },
        { etiqueta: 'Habeas data', ruta: '/admin/habeas-data' },
      ],
    },
    {
      titulo: 'Administracion',
      items: [
        { etiqueta: 'Configuracion', ruta: '/admin/configuracion' },
        { etiqueta: 'Festivos', ruta: '/admin/festivos' },
        { etiqueta: 'Catalogo SNIES', ruta: '/admin/catalogos/snies' },
        { etiqueta: 'Declaraciones juramentadas', ruta: '/admin/catalogos/declaraciones' },
        { etiqueta: 'Auditoria', ruta: '/admin/auditoria' },
        { etiqueta: 'Reportes', ruta: '/admin/reportes' },
        { etiqueta: 'Notificaciones', ruta: '/admin/notificaciones', exacta: true },
        { etiqueta: 'Entregas de correo', ruta: '/admin/notificaciones/entregas' },
      ],
    },
    {
      titulo: 'Seguridad',
      items: [
        { etiqueta: 'Roles', ruta: '/admin/roles', exacta: true },
        { etiqueta: 'Matriz de permisos', ruta: '/admin/roles/matriz' },
      ],
    },
  ],
};

export const TITULO_ROL: Readonly<Record<Rol, string>> = {
  BENEFICIARIO: 'Portal del beneficiario',
  FUNCIONARIO: 'Consola del funcionario',
  ADMINISTRADOR: 'Panel de administracion',
};
