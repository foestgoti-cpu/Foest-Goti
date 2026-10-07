import { VerificarFormatoSchema, type VerificarFormatoDto } from '@foest/shared';
import { AppError, supabaseAdmin } from '../../shared';
import { verificarCodigoLaborSocial } from '../labor_social/labor_social.verificacion';

/**
 * Verificacion publica por codigo. Responde unicamente { valido, tipo, generado_en, sha256 }.
 * Un codigo inexistente devuelve { valido: false } (no revela existencia ni datos personales).
 * `valido: true` solo significa que la plataforma emitio un archivo con ese codigo; no implica
 * que el formato este vigente ni firmado, ni es firma digital certificada.
 */
export async function verificarFormatoPublico(codigo: string): Promise<VerificarFormatoDto> {
  const { data, error } = await supabaseAdmin.rpc('fn_verificar_formato', { p_codigo: codigo });
  if (error) throw AppError.interno(`No fue posible verificar el formato: ${error.message}`);
  const fila = (Array.isArray(data) ? data[0] : data) as { valido: boolean; tipo: string | null; generado_en: string | null; sha256: string | null } | null;
  // Si no es un formato GE-F041 / GE-F043, se busca entre las emisiones de labor social (GE-F038).
  if (!fila || !fila.valido || !fila.tipo || !fila.generado_en || !fila.sha256) return verificarCodigoLaborSocial(codigo);
  return VerificarFormatoSchema.parse({
    valido: true,
    tipo: fila.tipo,
    generado_en: new Date(fila.generado_en).toISOString(),
    sha256: fila.sha256,
  });
}
