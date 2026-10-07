/**
 * API publica del modulo `evaluacion`:
 *   import { evaluacionRoutes } from '../evaluacion';
 * Puertos reemplazables (ver ports/): documentos, otorgamientos (seguimiento_beneficios) y labor_social.
 */
export { evaluacionRoutes } from './evaluacion.routes';
export { evaluacionService } from './evaluacion.service';
export { setDocumentosPort, type DocumentosPort } from './ports/documentos.port';
export { setOtorgamientosPort, type OtorgamientosPort, type CrearOtorgamientoInput } from './ports/otorgamientos.port';
export { setLaborSocialPort, type LaborSocialPort } from './ports/labor-social.port';
