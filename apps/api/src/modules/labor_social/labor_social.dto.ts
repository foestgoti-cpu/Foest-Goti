/**
 * Esquemas Zod de entrada de labor_social. Viven en `@foest/shared` (los comparte el formulario web).
 */
export {
  ActividadInputSchema as ActividadDto,
  ActividadPatchSchema as ActividadPatchDto,
  ActividadParamsSchema,
  BeneficiarioLaborSocialParamsSchema,
  CertificadoParamsSchema,
  CompletarCertificadoSchema as CompletarDto,
  CrearCertificadoSchema as CrearCertificadoDto,
  PresentarCertificadoSchema as PresentarDto,
  ReabrirCertificadoSchema as ReabrirDto,
} from '@foest/shared';
