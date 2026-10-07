import { TIPOS_FORMATO, type TipoFormato } from '@foest/shared';
import { AppError, supabaseAdmin } from '../../shared';
import { calcularHashContenido, cargarContexto } from './datos-formato.service';
import type { FormatoRow } from './formato.types';

/**
 * Vigencia de los formatos de una postulacion: compara el hash_contenido actual de cada tipo con
 * el del formato vigente. Lo consume `postulaciones` en la validacion previa y en /enviar y /subsanar.
 */
export interface ResultadoVigencia {
  vigentes: boolean;
  faltantes: string[];
  desactualizados: string[];
}

/** La tabla `formato_generado` aun no existe (migracion 0015 sin aplicar). */
export class FormatosNoDisponiblesError extends Error {
  constructor() {
    super('La tabla formato_generado no esta disponible');
    this.name = 'FormatosNoDisponiblesError';
  }
}

export function esTablaInexistente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(error.message ?? '');
}

/** Formato vigente (LISTO) de cada tipo para una postulacion. */
export async function formatosVigentesDe(postulacionId: string): Promise<Map<TipoFormato, FormatoRow>> {
  const { data, error } = await supabaseAdmin
    .from('formato_generado')
    .select('*')
    .eq('postulacion_id', postulacionId)
    .eq('vigente', true)
    .eq('estado', 'LISTO');
  if (error) {
    if (esTablaInexistente(error)) throw new FormatosNoDisponiblesError();
    throw AppError.interno(`No fue posible leer los formatos: ${error.message}`);
  }
  const mapa = new Map<TipoFormato, FormatoRow>();
  for (const f of (data ?? []) as FormatoRow[]) mapa.set(f.tipo, f);
  return mapa;
}

export async function formatosVigentes(postulacionId: string): Promise<ResultadoVigencia> {
  const vigentesPorTipo = await formatosVigentesDe(postulacionId);
  // Sin ningun formato vigente no hace falta leer los datos de la postulacion.
  const ctx = vigentesPorTipo.size > 0 ? await cargarContexto(postulacionId) : null;
  const faltantes: string[] = [];
  const desactualizados: string[] = [];

  for (const tipo of TIPOS_FORMATO) {
    const formato = vigentesPorTipo.get(tipo);
    if (!formato) {
      faltantes.push(tipo);
      continue;
    }
    if (!ctx || calcularHashContenido(ctx, tipo) !== formato.hash_contenido) desactualizados.push(tipo);
  }
  return { vigentes: faltantes.length === 0 && desactualizados.length === 0, faltantes, desactualizados };
}
