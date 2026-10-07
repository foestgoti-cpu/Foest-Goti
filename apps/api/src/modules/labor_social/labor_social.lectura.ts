import type { ResumenLaborSocialDto } from '@foest/shared';
import { logger, supabaseAdmin } from '../../shared';
import type { FilaCertificado } from './labor_social.types';

/**
 * Lector de solo lectura de labor social (lo consume `evaluacion` y el expediente del evaluador).
 * No expone el detalle de actividades. Devuelve `null` si el beneficiario no tiene certificados o si la
 * tabla aun no existe (migracion 0019 sin aplicar).
 */

const COLUMNAS_RESUMEN = 'id, semestre_academico, total_horas_acumuladas, horas_minimas_requeridas, estado';

type FilaResumen = Pick<FilaCertificado, 'id' | 'semestre_academico' | 'total_horas_acumuladas' | 'horas_minimas_requeridas' | 'estado'>;

export function aResumen(f: FilaResumen): ResumenLaborSocialDto {
  const total = Number(f.total_horas_acumuladas ?? 0);
  const minimas = f.horas_minimas_requeridas == null ? null : Number(f.horas_minimas_requeridas);
  return {
    total_horas_acumuladas: total,
    horas_minimas_requeridas: minimas,
    estado: f.estado,
    certificado_id: f.id,
    semestre_academico: f.semestre_academico,
    cumple_minimo: minimas == null ? undefined : total >= minimas && total > 0,
  };
}

/** Resumen del certificado mas reciente del beneficiario (`beneficiario.id`). */
export async function resumenLaborSocial(beneficiarioId: string): Promise<ResumenLaborSocialDto | null> {
  const { data, error } = await supabaseAdmin
    .from('certificado_labor_social')
    .select(COLUMNAS_RESUMEN)
    .eq('beneficiario_id', beneficiarioId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.debug({ code: (error as { code?: string }).code }, 'labor_social: certificado_labor_social no disponible');
    return null;
  }
  return data ? aResumen(data as FilaResumen) : null;
}

/** Resumen por postulacion (certificado ligado a esa postulacion), o `null`. */
export async function resumenLaborSocialPorPostulacion(postulacionId: string): Promise<ResumenLaborSocialDto | null> {
  const { data, error } = await supabaseAdmin
    .from('certificado_labor_social')
    .select(COLUMNAS_RESUMEN)
    .eq('postulacion_id', postulacionId)
    .maybeSingle();
  if (error) {
    logger.debug({ code: (error as { code?: string }).code }, 'labor_social: certificado_labor_social no disponible');
    return null;
  }
  return data ? aResumen(data as FilaResumen) : null;
}
