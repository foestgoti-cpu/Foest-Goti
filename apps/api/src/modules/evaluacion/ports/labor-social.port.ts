import type { LaborSocialResumenDto } from '@foest/shared';
import { logger, supabaseAdmin } from '../../../shared';
import { resumenLaborSocial } from '../../labor_social/labor_social.lectura';

/**
 * Puerto de solo lectura de las horas de labor social del estudiante (evaluacion -> labor_social).
 *
 * PROVISIONAL(labor_social): consulta `certificado_labor_social` (campos de docs/modules/labor_social.md)
 * y devuelve `null` si la tabla no existe o aun no coincide el esquema.
 */
export interface LaborSocialPort {
  horasDelBeneficiario(beneficiarioId: string): Promise<LaborSocialResumenDto | null>;
}

interface FilaCertificado {
  total_horas_acumuladas: number | string | null;
  horas_minimas_requeridas: number | string | null;
  estado: string | null;
}

export function crearLaborSocialPortProvisional(): LaborSocialPort {
  return {
    async horasDelBeneficiario(beneficiarioId) {
      const { data, error } = await supabaseAdmin
        .from('certificado_labor_social')
        .select('total_horas_acumuladas, horas_minimas_requeridas, estado')
        .eq('beneficiario_id', beneficiarioId)
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        logger.debug({ code: (error as { code?: string }).code }, 'PROVISIONAL(labor_social): certificado_labor_social no disponible');
        return null;
      }
      const fila = data as FilaCertificado | null;
      if (!fila) return null;
      return {
        total_horas_acumuladas: Number(fila.total_horas_acumuladas ?? 0),
        horas_minimas_requeridas: fila.horas_minimas_requeridas == null ? null : Number(fila.horas_minimas_requeridas),
        estado: fila.estado,
      };
    },
  };
}

/** Implementacion real: lector de solo lectura del modulo labor_social (migracion 0019). */
export function crearLaborSocialPortReal(): LaborSocialPort {
  return { horasDelBeneficiario: (beneficiarioId) => resumenLaborSocial(beneficiarioId) };
}

let laborSocialPort: LaborSocialPort = crearLaborSocialPortReal();

export function setLaborSocialPort(port: LaborSocialPort): void {
  laborSocialPort = port;
}

export function horasLaborSocial(beneficiarioId: string): Promise<LaborSocialResumenDto | null> {
  return laborSocialPort.horasDelBeneficiario(beneficiarioId);
}
