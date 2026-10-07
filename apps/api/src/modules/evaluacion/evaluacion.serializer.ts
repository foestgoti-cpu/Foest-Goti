import {
  FIRMA_EVALUACION,
  type ChequeoItemDto,
  type CodigoBeneficio,
  type ObservacionPublicaDictamen,
  type ResultadoDictamen,
  type RevisionBeneficioDto,
  type RevisionHistorialDto,
} from '@foest/shared';
import type { RevisionBeneficioRow, RevisionDocumentoRow, RevisionRow } from './evaluacion.types';

/**
 * Serializadores del modulo `evaluacion`.
 *
 * ANONIMATO: `observacionPublicaDictamen` es la UNICA estructura que viaja al beneficiario (se guarda en
 * `postulacion.correccion_vigente` y la expone el serializador `observacionPublica` de postulaciones).
 * Es una lista blanca: no recibe ni copia funcionario_id, nombres, cargo ni asignacion.
 */

export function numeroONulo(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function aRevisionBeneficioDto(b: RevisionBeneficioRow): RevisionBeneficioDto {
  return {
    codigo: b.beneficio_codigo,
    decision: b.decision,
    motivo: b.motivo,
    monto_aprobado: b.decision === 'APROBADO' ? numeroONulo(b.monto_aprobado) : null,
  };
}

export interface EntradaObservacionPublica {
  ciclo: number;
  resultado: ResultadoDictamen;
  observaciones: string | null;
  campos_observados: string[];
  documentos_observados: string[];
  fecha_limite_subsanacion: string | null;
  beneficios: RevisionBeneficioDto[];
  decidida_en: string;
}

/** Construye la observacion publica del dictamen (lista blanca; firma fija "Equipo FOEST"). */
export function observacionPublicaDictamen(e: EntradaObservacionPublica): ObservacionPublicaDictamen {
  return {
    firma: FIRMA_EVALUACION,
    ciclo: e.ciclo,
    resultado: e.resultado,
    observaciones: e.observaciones,
    campos_observados: [...e.campos_observados],
    documentos_observados: [...e.documentos_observados],
    fecha_limite_subsanacion: e.fecha_limite_subsanacion,
    beneficios: e.beneficios.map((b) => ({
      codigo: b.codigo as CodigoBeneficio,
      decision: b.decision,
      motivo: b.motivo,
      monto_aprobado: b.monto_aprobado,
    })),
    decidida_en: e.decidida_en,
  };
}

export function aChequeoItemDto(fila: RevisionDocumentoRow, codigoDeTipo: (tipoId: string) => string): ChequeoItemDto {
  return {
    tipo_codigo: codigoDeTipo(fila.tipo_id),
    resultado: fila.resultado,
    observacion: fila.observacion_especifica,
    documento_id: fila.documento_id,
    documento_version: fila.documento_version,
    verificado_en: fila.verificado_en,
  };
}

function listaTexto(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.map(String) : [];
}

export interface OpcionesHistorial {
  /** `true` solo para el administrador: incluye el nombre del evaluador. */
  esAdmin: boolean;
  /** Usuario que consulta (para marcar `propia`). */
  usuarioId: string;
  nombreFuncionario: (funcionarioId: string) => { id: string; nombres: string | null; apellidos: string | null } | null;
  codigoDeTipo: (tipoId: string) => string;
}

/** Revision DECIDIDA -> DTO de historial para el personal (nunca para el beneficiario). */
export function aRevisionHistorialDto(
  r: RevisionRow,
  documentos: RevisionDocumentoRow[],
  beneficios: RevisionBeneficioRow[],
  opciones: OpcionesHistorial,
): RevisionHistorialDto {
  const dto: RevisionHistorialDto = {
    revision_id: r.id,
    ciclo: r.ciclo,
    resultado: r.resultado as ResultadoDictamen,
    observaciones: r.observaciones,
    campos_observados: listaTexto(r.campos_observados),
    documentos_observados: listaTexto(r.documentos_observados),
    fecha_limite_subsanacion: r.fecha_limite_subsanacion,
    version_postulacion: r.version_postulacion,
    iniciada_en: r.iniciada_en,
    decidida_en: r.decidida_en as string,
    beneficios: beneficios.map(aRevisionBeneficioDto),
    documentos: documentos.map((d) => aChequeoItemDto(d, opciones.codigoDeTipo)),
    propia: !opciones.esAdmin && r.funcionario_id === opciones.usuarioId,
  };
  if (opciones.esAdmin) dto.funcionario = opciones.nombreFuncionario(r.funcionario_id);
  return dto;
}
