import type { AlcancePermiso, Permiso, Rol } from '@foest/shared';

export interface RolItem {
  id: Rol;
  nombre: Rol;
  descripcion: string;
  es_base: true;
  total_permisos: number;
}

export interface PermisoItem {
  codigo: Permiso;
  descripcion: string;
  categoria: string;
  alcance: AlcancePermiso;
  regla_alcance: string;
}

export interface PermisosDeRol {
  rol: RolItem;
  permisos: PermisoItem[];
}

export interface FilaMatriz extends PermisoItem {
  roles: Record<Rol, boolean>;
}

export interface MatrizPermisos {
  roles: RolItem[];
  categorias: string[];
  filas: FilaMatriz[];
}

export interface PermisosMios {
  usuario_id: string;
  rol: Rol;
  permisos: Permiso[];
}

export const ETIQUETA_ROL: Readonly<Record<Rol, string>> = {
  ADMINISTRADOR: 'Administrador',
  FUNCIONARIO: 'Funcionario',
  BENEFICIARIO: 'Beneficiario',
};

export const ETIQUETA_ALCANCE: Readonly<Record<AlcancePermiso, string>> = {
  GLOBAL: 'Global',
  ASIGNADO: 'Asignado',
  PROPIO: 'Propio',
  COMITE: 'Comite',
  PUBLICO: 'Publico',
};

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

export function tituloCategoria(categoria: string): string {
  return TITULO_CATEGORIA[categoria] ?? categoria;
}
