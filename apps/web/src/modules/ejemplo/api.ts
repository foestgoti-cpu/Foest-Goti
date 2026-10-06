import { api, type Paginado } from '../../lib/api';
import type { BeneficioItem } from './types';

/** Cliente HTTP del modulo: funciones puras que envuelven `api`. */
export const ejemploApi = {
  listarBeneficios: (page = 1, page_size = 20) =>
    api.get<Paginado<BeneficioItem>>('/ejemplo', { query: { page, page_size } }),
};
