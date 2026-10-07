/**
 * Tipos del modulo evaluacion: los DTOs y esquemas viven en `@foest/shared`
 * (packages/shared/src/evaluacion). Aqui solo se reexportan y se declaran tipos puramente de UI.
 */
export {
  RESULTADOS_DOCUMENTO,
  RESULTADOS_DICTAMEN,
  OBSERVACION_MIN_CARACTERES,
  CODIGOS_ERROR_EVALUACION,
  DictamenInputSchema,
  ChequeoInputSchema,
} from '@foest/shared';
export type {
  ResultadoDocumento,
  ResultadoDictamen,
  DecisionBeneficio,
  ModoExpediente,
  CodigoErrorEvaluacion,
  ExpedienteEvaluacionDto,
  PostulacionEvaluacionDto,
  DocumentoExpedienteDto,
  BeneficioExpedienteDto,
  DatosPagoEnmascaradosDto,
  ChequeoVigenteDto,
  ChequeoItemDto,
  RevisionHistorialDto,
  HistorialRevisionesDto,
  DictamenRespuestaDto,
  ChequeoGuardadoDto,
  AdvertenciaDictamenDto,
  LaborSocialResumenDto,
  ConfiguracionSubsanacionDto,
  ChequeoInput,
  ChequeoItemInput,
  DictamenInput,
  DictamenBeneficioInput,
} from '@foest/shared';

/** URL firmada de lectura (modulo documentos). */
export interface UrlDocumento {
  url: string;
  expira_en?: string | null;
}
