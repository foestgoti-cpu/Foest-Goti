import type { CategoriaBeneficio, CodigoBeneficio } from '@foest/shared';

export interface BeneficioItem {
  codigo: CodigoBeneficio;
  nombre: string;
  categoria: CategoriaBeneficio;
  activo: boolean;
}
