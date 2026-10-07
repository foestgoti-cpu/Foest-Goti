import { textoEstadoBeneficiario, type CodigoBeneficio } from '@foest/shared';
import type { ConvocatoriaResumen, CorreccionVigente, HistorialRow, PostulacionRow } from './postulaciones.types';

/**
 * Serializadores explicitos (postulaciones.md, "Anonimato del evaluador").
 * Toda respuesta al beneficiario pasa por aqui: no contiene ningun campo de actor.
 */

export interface ObservacionPublicaBeneficio {
  codigo: string;
  decision: string;
  motivo: string | null;
  monto_aprobado: number | null;
}

export interface ObservacionPublica {
  firma: 'Equipo FOEST';
  observaciones: string | null;
  campos_observados: string[];
  documentos_observados: string[];
  /** Solo presentes cuando el dictamen del modulo `evaluacion` los guardo (lista blanca; sin datos de actor). */
  ciclo?: number;
  resultado?: string;
  fecha_limite_subsanacion?: string | null;
  decidida_en?: string;
  beneficios?: ObservacionPublicaBeneficio[];
}

const RESULTADOS_PUBLICOS = new Set(['APROBAR', 'RECHAZAR', 'CORRECCION']);

export function observacionPublica(c: CorreccionVigente | null | undefined): ObservacionPublica | null {
  if (!c) return null;
  const salida: ObservacionPublica = {
    firma: 'Equipo FOEST',
    observaciones: typeof c.observaciones === 'string' ? c.observaciones : null,
    campos_observados: Array.isArray(c.campos_observados) ? c.campos_observados.map(String) : [],
    documentos_observados: Array.isArray(c.documentos_observados) ? c.documentos_observados.map(String) : [],
  };
  // Campos del dictamen (evaluacion): se copian uno a uno desde una lista blanca.
  if (typeof c.ciclo === 'number') salida.ciclo = c.ciclo;
  if (typeof c.resultado === 'string' && RESULTADOS_PUBLICOS.has(c.resultado)) salida.resultado = c.resultado;
  if (typeof c.fecha_limite_subsanacion === 'string' || c.fecha_limite_subsanacion === null) {
    salida.fecha_limite_subsanacion = c.fecha_limite_subsanacion as string | null;
  }
  if (typeof c.decidida_en === 'string') salida.decidida_en = c.decidida_en;
  if (Array.isArray(c.beneficios)) {
    salida.beneficios = (c.beneficios as Array<Record<string, unknown>>)
      .filter((b) => b && typeof b === 'object' && typeof b.codigo === 'string' && typeof b.decision === 'string')
      .map((b) => ({
        codigo: String(b.codigo),
        decision: String(b.decision),
        motivo: typeof b.motivo === 'string' ? b.motivo : null,
        monto_aprobado: typeof b.monto_aprobado === 'number' ? b.monto_aprobado : null,
      }));
  }
  return salida;
}

export interface PostulacionBeneficiarioDTO {
  id: string;
  convocatoria_id: string;
  convocatoria: ConvocatoriaResumen | null;
  tipo_solicitud: PostulacionRow['tipo_solicitud'];
  estado: PostulacionRow['estado'];
  estado_texto: string;
  beneficios: CodigoBeneficio[];
  datos_formulario: Record<string, unknown>;
  valor_matricula_letras: string | null;
  ciclo: number;
  version: number;
  aprobacion_parcial: boolean;
  fecha_limite_subsanacion: string | null;
  enviada_en: string | null;
  correccion_vigente: ObservacionPublica | null;
  creado_en: string;
  actualizado_en: string;
}

export function aBeneficiarioDTO(
  p: PostulacionRow,
  beneficios: CodigoBeneficio[],
  convocatoria: ConvocatoriaResumen | null,
): PostulacionBeneficiarioDTO {
  return {
    id: p.id,
    convocatoria_id: p.convocatoria_id,
    convocatoria,
    tipo_solicitud: p.tipo_solicitud,
    estado: p.estado,
    estado_texto: textoEstadoBeneficiario(p.estado, p.aprobacion_parcial),
    beneficios,
    datos_formulario: p.datos_formulario ?? {},
    valor_matricula_letras: p.valor_matricula_letras,
    ciclo: p.ciclo,
    version: p.version,
    aprobacion_parcial: p.aprobacion_parcial,
    fecha_limite_subsanacion: p.fecha_limite_subsanacion,
    enviada_en: p.enviada_en,
    correccion_vigente: observacionPublica(p.correccion_vigente),
    creado_en: p.creado_en,
    actualizado_en: p.actualizado_en,
  };
}

export interface PostulacionAdminDTO extends Omit<PostulacionBeneficiarioDTO, 'correccion_vigente'> {
  beneficiario_id: string;
  beneficiario: { nombres: string | null; apellidos: string | null; tipo_documento: string | null; numero_documento: string | null } | null;
  correccion_vigente: CorreccionVigente | null;
  correcciones_perfil: Record<string, unknown> | null;
}

export function aAdminDTO(
  p: PostulacionRow,
  beneficios: CodigoBeneficio[],
  convocatoria: ConvocatoriaResumen | null,
  beneficiario: PostulacionAdminDTO['beneficiario'],
): PostulacionAdminDTO {
  const base = aBeneficiarioDTO(p, beneficios, convocatoria);
  return {
    ...base,
    beneficiario_id: p.beneficiario_id,
    beneficiario,
    correccion_vigente: p.correccion_vigente,
    correcciones_perfil: p.correcciones_perfil,
  };
}

/** Motivos de movimientos internos del comite que no se muestran al beneficiario. */
const MOTIVOS_INTERNOS = new Set(['TOMA', 'LIBERACION', 'CONFLICTO_INTERES', 'REASIGNACION']);

export interface HistorialBeneficiarioItem {
  id: string;
  ciclo: number;
  estado_anterior: HistorialRow['estado_anterior'];
  estado_nuevo: HistorialRow['estado_nuevo'];
  estado_texto: string;
  motivo: string;
  /** "Usted" para el beneficiario, "Equipo FOEST" para funcionarios/administradores, "Sistema" para jobs. */
  quien: 'Usted' | 'Equipo FOEST' | 'Sistema';
  observaciones: string | null;
  cambiado_en: string;
}

export function historialParaBeneficiario(filas: HistorialRow[]): HistorialBeneficiarioItem[] {
  return filas
    .filter((h) => !MOTIVOS_INTERNOS.has(h.motivo))
    .map((h) => ({
      id: h.id,
      ciclo: h.ciclo,
      estado_anterior: h.estado_anterior,
      estado_nuevo: h.estado_nuevo,
      estado_texto: textoEstadoBeneficiario(h.estado_nuevo),
      motivo: h.motivo,
      quien: h.actor_tipo === 'BENEFICIARIO' ? 'Usted' : h.actor_tipo === 'SISTEMA' ? 'Sistema' : 'Equipo FOEST',
      // Las observaciones de funcionarios se presentan via correccion_vigente (ObservacionPublica), no aqui.
      observaciones: h.actor_tipo === 'BENEFICIARIO' || h.actor_tipo === 'SISTEMA' ? h.observaciones : null,
      cambiado_en: h.cambiado_en,
    }));
}

export function historialParaAdmin(filas: HistorialRow[]): HistorialRow[] {
  return filas;
}
