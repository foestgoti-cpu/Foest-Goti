import type { CategoriaBeneficio, CodigoBeneficio } from '@foest/shared';

/** Tipos internos del modulo (filas de BD, DTOs de salida). */
export interface BeneficioItem {
  codigo: CodigoBeneficio;
  nombre: string;
  categoria: CategoriaBeneficio;
  activo: boolean;
}
