import { FORMATO_POR_TIPO_DOCUMENTO, TIPOS_CON_FORMATO_GENERADO, type TipoDocumento } from '@foest/shared';
import { AppError, logger, supabaseAdmin } from '../../../shared';

/**
 * Puerto de verificacion del formato oficial vinculado a FORM_INS y PAG_CART.
 * Regla (documentos.md): `formato_generado_id` obligatorio, vigente, de la misma postulacion y del
 * tipo correcto (GE-F041 para FORM_INS, GE-F043 para PAG_CART); si no, 422 FORMATO_NO_VIGENTE.
 *
 * PROVISIONAL(formatos_oficiales): consulta `formato_generado` (0015). Si la tabla aun no existe
 * se acepta el soporte sin vinculo (`PROVISIONAL`) para no bloquear la carga.
 */
export type ResultadoFormato = 'OK' | 'FORMATO_NO_VIGENTE' | 'PROVISIONAL';

export interface FormatoVigentePort {
  verificar(postulacionId: string, tipo: TipoDocumento, formatoId: string | undefined): Promise<ResultadoFormato>;
}

export function tipoRequiereFormato(tipo: TipoDocumento): tipo is (typeof TIPOS_CON_FORMATO_GENERADO)[number] {
  return (TIPOS_CON_FORMATO_GENERADO as readonly string[]).includes(tipo);
}

/** Errores de PostgREST/Postgres que indican que la tabla no existe. */
function tablaNoExiste(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '');
}

const implementacionPorDefecto: FormatoVigentePort = {
  async verificar(postulacionId, tipo, formatoId) {
    if (!tipoRequiereFormato(tipo)) return 'OK';
    const { data, error } = await supabaseAdmin
      .from('formato_generado')
      .select('id, tipo, postulacion_id, estado, vigente')
      .eq('postulacion_id', postulacionId)
      .eq('tipo', FORMATO_POR_TIPO_DOCUMENTO[tipo])
      .eq('vigente', true);
    if (error) {
      if (tablaNoExiste(error)) {
        logger.warn('PROVISIONAL(formatos_oficiales): tabla formato_generado inexistente; se omite la verificacion del formato');
        return 'PROVISIONAL';
      }
      throw AppError.interno(`No fue posible verificar el formato vigente: ${error.message}`);
    }
    const filas = (data ?? []) as Array<{ id: string; estado: string | null }>;
    if (!formatoId) return 'FORMATO_NO_VIGENTE';
    const coincide = filas.some((f) => f.id === formatoId && (f.estado === null || f.estado === 'LISTO'));
    return coincide ? 'OK' : 'FORMATO_NO_VIGENTE';
  },
};

let puerto: FormatoVigentePort = implementacionPorDefecto;

export function obtenerFormatoVigentePort(): FormatoVigentePort {
  return puerto;
}

/** Permite inyectar la implementacion real de formatos_oficiales (o simulada en pruebas). */
export function setFormatoVigentePort(p: FormatoVigentePort | null): void {
  puerto = p ?? implementacionPorDefecto;
}
