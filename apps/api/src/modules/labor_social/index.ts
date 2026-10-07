/**
 * API publica del modulo `labor_social`:
 *   import { laborSocialRoutes, laborSocialBeneficiarioRoutes, verificarCodigoLaborSocial, resumenLaborSocial } from '../labor_social';
 *
 * - `verificarCodigoLaborSocial(codigo)`: lo usa formatos_oficiales (`GET /publico/verificar/:codigo`) cuando el
 *   codigo no es de un GE-F041 / GE-F043. Responde solo { valido, tipo, generado_en, sha256 }.
 * - `resumenLaborSocial(beneficiarioId)`: lector de solo lectura para evaluacion / expediente del evaluador.
 */
export { laborSocialRoutes, laborSocialBeneficiarioRoutes } from './labor_social.routes';
export { laborSocialService } from './labor_social.service';
export { resumenLaborSocial, resumenLaborSocialPorPostulacion } from './labor_social.lectura';
export { verificarCodigoLaborSocial } from './labor_social.verificacion';
