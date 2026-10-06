import type { AlcancePermiso, Permiso, Rol } from '@foest/shared';

/** Rol base del sistema. `id` es el nombre (clave natural de los roles inmutables). */
export interface RolItem {
  id: Rol;
  nombre: Rol;
  descripcion: string;
  es_base: true;
  /** Cantidad de permisos concedidos por la matriz. */
  total_permisos: number;
}

/** Entrada del catalogo de permisos con categoria y regla de alcance. */
export interface PermisoItem {
  codigo: Permiso;
  descripcion: string;
  categoria: string;
  alcance: AlcancePermiso;
  /** Nota de alcance por rol (columna "Regla de alcance" de la matriz). */
  regla_alcance: string;
}

/** Permisos de un rol concreto. */
export interface PermisosDeRol {
  rol: RolItem;
  permisos: PermisoItem[];
}

/** Fila de la matriz rol x permiso para la vista administrativa. */
export interface FilaMatriz extends PermisoItem {
  roles: Record<Rol, boolean>;
}

export interface MatrizPermisos {
  roles: RolItem[];
  categorias: string[];
  filas: FilaMatriz[];
}

/** Permisos efectivos del usuario autenticado (resueltos en servidor). */
export interface PermisosMios {
  usuario_id: string;
  rol: Rol;
  permisos: Permiso[];
}
