/**
 * API publica del modulo formatos_oficiales para otros modulos:
 *   import { formatosVigentes, verificarFormatoPublico } from '../formatos_oficiales';
 */
export { formatosVigentes, FormatosNoDisponiblesError, type ResultadoVigencia } from './vigencia.service';
export { verificarFormatoPublico } from './verificacion.service';
export { formatosRoutes, formatosPostulacionRoutes, formatosPublicoRoutes } from './formato.routes';
