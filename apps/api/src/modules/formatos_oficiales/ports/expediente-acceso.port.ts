import type { UsuarioAutenticado } from '../../../shared';
import { supabaseAdmin } from '../../../shared';

/**
 * Alcance de lectura de un expediente para formatos oficiales.
 *
 * PROVISIONAL(asignaciones): el modulo `asignaciones` (migracion 0016) exportara
 * `tieneAsignacionActiva(funcionarioId, postulacionId)`. Mientras no exista la tabla
 * `postulacion_asignacion`, el funcionario accede por pertenecer al comite de la
 * convocatoria (`asignacion_funcionario` sin `retirado_en`). Reemplazar el cuerpo de
 * `funcionarioTieneAlcance` por la llamada al modulo cuando este disponible.
 */

export interface ExpedienteMinimo {
  id: string;
  beneficiario_id: string;
  convocatoria_id: string;
}

function tablaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '');
}

async function funcionarioTieneAlcance(funcionarioId: string, exp: ExpedienteMinimo): Promise<boolean> {
  // Asignacion activa (0016), cuando la tabla exista.
  const asignacion = await supabaseAdmin
    .from('postulacion_asignacion')
    .select('id', { head: true, count: 'exact' })
    .eq('postulacion_id', exp.id)
    .eq('funcionario_id', funcionarioId)
    .eq('estado', 'ACTIVA');
  if (!asignacion.error && (asignacion.count ?? 0) > 0) return true;
  if (asignacion.error && !tablaInexistente(asignacion.error)) throw new Error(`No fue posible verificar la asignacion: ${asignacion.error.message}`);

  // Correccion de verificacion (D-02): pertenecer al comite NO basta para leer el expediente (resumen con
  // estrato/SISBEN/documento, formatos): el pool solo expone el resumen minimo y el expediente es de su
  // evaluador. Se admite ademas al funcionario que ya emitio o abrio una revision sobre la postulacion
  // (la asignacion se libera al dictaminar y debe poder consultar lo que evaluo).
  const revision = await supabaseAdmin
    .from('revision')
    .select('id', { head: true, count: 'exact' })
    .eq('postulacion_id', exp.id)
    .eq('funcionario_id', funcionarioId);
  if (revision.error && !tablaInexistente(revision.error)) throw new Error(`No fue posible verificar la revision: ${revision.error.message}`);
  return !revision.error && (revision.count ?? 0) > 0;
}

/** true si el usuario es el dueno, administrador o funcionario con alcance. Si no, el llamador responde 404. */
export async function puedeLeerExpediente(user: UsuarioAutenticado, exp: ExpedienteMinimo): Promise<boolean> {
  if (user.rol === 'ADMINISTRADOR') return true;
  if (user.rol === 'BENEFICIARIO') return esDuenoDelExpediente(user.id, exp);
  if (user.rol === 'FUNCIONARIO') return funcionarioTieneAlcance(user.id, exp);
  return false;
}

export async function esDuenoDelExpediente(usuarioId: string, exp: ExpedienteMinimo): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('beneficiario').select('id').eq('usuario_id', usuarioId).maybeSingle();
  if (error) throw new Error(`No fue posible verificar el beneficiario: ${error.message}`);
  return Boolean(data && (data as { id: string }).id === exp.beneficiario_id);
}
