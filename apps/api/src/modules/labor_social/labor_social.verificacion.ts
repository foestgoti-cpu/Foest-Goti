import { VerificarFormatoSchema, type VerificarFormatoDto } from '@foest/shared';
import { logger, supabaseAdmin } from '../../shared';

/**
 * Verificacion publica de un GE-F038 por codigo. Responde unicamente { valido, tipo, generado_en, sha256 };
 * un codigo inexistente (o la funcion SQL aun sin migrar) devuelve { valido: false } sin revelar nada.
 */
export async function verificarCodigoLaborSocial(codigo: string): Promise<VerificarFormatoDto> {
  const { data, error } = await supabaseAdmin.rpc('fn_verificar_labor_social', { p_codigo: codigo });
  if (error) {
    logger.debug({ code: (error as { code?: string }).code }, 'labor_social: fn_verificar_labor_social no disponible');
    return { valido: false };
  }
  const fila = (Array.isArray(data) ? data[0] : data) as { valido: boolean; tipo: string | null; generado_en: string | null; sha256: string | null } | null;
  if (!fila || !fila.valido || !fila.tipo || !fila.generado_en || !fila.sha256) return { valido: false };
  return VerificarFormatoSchema.parse({
    valido: true,
    tipo: fila.tipo,
    generado_en: new Date(fila.generado_en).toISOString(),
    sha256: fila.sha256,
  });
}
