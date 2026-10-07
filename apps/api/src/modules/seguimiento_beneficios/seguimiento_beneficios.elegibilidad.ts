import { ESTADOS_OTORGAMIENTO, ESTADOS_OTORGAMIENTO_COMPROMETEN, type EstadoOtorgamiento, type TipoSolicitud } from '@foest/shared';
import { AppError, supabaseAdmin } from '../../shared';
import { configuracionService } from '../catalogos_configuracion';
import { esEsquemaAusente } from './seguimiento_beneficios.db';

/**
 * Elegibilidad de los tramites RENOVACION y REINTEGRO (docs/modules/seguimiento_beneficios.md).
 * Implementa la interfaz `ElegibilidadPort` de postulaciones (estructuralmente, sin importarla):
 *   - PRIMERA_VEZ: siempre elegible.
 *   - RENOVACION: otorgamiento del beneficiario en la convocatoria INMEDIATAMENTE ANTERIOR (por anio, semestre)
 *     en uno de los estados de ELEGIBILIDAD_RENOVACION_ESTADOS (por defecto ACTIVO o CUMPLIDO).
 *   - REINTEGRO: otorgamiento previo (no REVOCADO si ELEGIBILIDAD_REINTEGRO_EXCLUYE_REVOCADOS) y al menos
 *     ELEGIBILIDAD_REINTEGRO_PERIODOS_SIN_APOYO_MIN convocatorias sin apoyo entre ese otorgamiento y la actual.
 * Reglas parametrizables y "a confirmar con el Acuerdo 023".
 */
export interface ResultadoElegibilidadSeguimiento {
  elegible: boolean;
  /** Primer motivo (compatible con `ResultadoElegibilidad` de postulaciones). */
  motivo?: string;
  motivos?: string[];
  otorgamiento_referencia_id?: string;
}

interface ConvocatoriaOrden {
  id: string;
  nombre: string | null;
  anio: number;
  semestre: number;
}

interface OtorgamientoResumen {
  id: string;
  convocatoria_id: string;
  estado: EstadoOtorgamiento;
}

function noElegible(...motivos: string[]): ResultadoElegibilidadSeguimiento {
  return { elegible: false, motivo: motivos[0], motivos };
}

async function estadosRenovacion(excluyeRevocados: boolean): Promise<EstadoOtorgamiento[]> {
  const crudo = (await configuracionService.get('ELEGIBILIDAD_RENOVACION_ESTADOS')) ?? 'ACTIVO,CUMPLIDO';
  let estados = crudo
    .split(',')
    .map((e) => e.trim().toUpperCase())
    .filter((e): e is EstadoOtorgamiento => (ESTADOS_OTORGAMIENTO as readonly string[]).includes(e));
  if (excluyeRevocados) estados = estados.filter((e) => e !== 'REVOCADO');
  return estados;
}

/** Respaldo cuando la migracion 0018 no esta aplicada: exige una postulacion APROBADA previa (regla P1). */
async function respaldoSinTabla(beneficiarioId: string, convocatoriaId: string, tipo: TipoSolicitud): Promise<ResultadoElegibilidadSeguimiento> {
  const { count, error } = await supabaseAdmin
    .from('postulacion')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', beneficiarioId)
    .eq('estado', 'APROBADA')
    .neq('convocatoria_id', convocatoriaId);
  if (error) throw AppError.interno(`No fue posible verificar la elegibilidad: ${error.message}`);
  if ((count ?? 0) > 0) return { elegible: true };
  return noElegible(
    tipo === 'RENOVACION'
      ? 'Para renovar debe contar con una postulacion aprobada en una convocatoria anterior'
      : 'Para reintegrar debe haber sido beneficiario aprobado en una convocatoria anterior',
  );
}

export async function validarElegibilidad(beneficiarioId: string, convocatoriaId: string, tipo: TipoSolicitud): Promise<ResultadoElegibilidadSeguimiento> {
  if (tipo === 'PRIMERA_VEZ') return { elegible: true };

  const { data: convs, error: errConv } = await supabaseAdmin.from('convocatoria').select('id, nombre, anio, semestre').order('anio', { ascending: true }).order('semestre', { ascending: true });
  if (errConv) throw AppError.interno(`No fue posible verificar la elegibilidad: ${errConv.message}`);
  const orden = (convs ?? []) as ConvocatoriaOrden[];
  const idx = orden.findIndex((c) => c.id === convocatoriaId);
  if (idx < 0) return noElegible('La convocatoria indicada no existe');

  const { data: otor, error: errOt } = await supabaseAdmin.from('otorgamiento').select('id, convocatoria_id, estado').eq('beneficiario_id', beneficiarioId);
  if (errOt) {
    if (esEsquemaAusente(errOt as { code?: string })) return respaldoSinTabla(beneficiarioId, convocatoriaId, tipo);
    throw AppError.interno(`No fue posible verificar la elegibilidad: ${errOt.message}`);
  }
  const otorgamientos = (otor ?? []) as OtorgamientoResumen[];
  const excluyeRevocados = await configuracionService.getBool('ELEGIBILIDAD_REINTEGRO_EXCLUYE_REVOCADOS', true);

  if (tipo === 'RENOVACION') {
    const anterior = orden[idx - 1];
    if (!anterior) return noElegible('No existe una convocatoria anterior sobre la cual renovar');
    const permitidos = await estadosRenovacion(excluyeRevocados);
    const ref = otorgamientos.find((o) => o.convocatoria_id === anterior.id && permitidos.includes(o.estado));
    if (ref) return { elegible: true, otorgamiento_referencia_id: ref.id };
    return noElegible(
      `Para renovar debe contar con un apoyo vigente o cumplido en la convocatoria inmediatamente anterior${anterior.nombre ? ` (${anterior.nombre})` : ''}`,
    );
  }

  // REINTEGRO
  const posicion = new Map(orden.map((c, i) => [c.id, i] as const));
  const previos = otorgamientos
    .filter((o) => (posicion.get(o.convocatoria_id) ?? Number.POSITIVE_INFINITY) < idx)
    .filter((o) => !(excluyeRevocados && o.estado === 'REVOCADO'));
  if (previos.length === 0) return noElegible('Para reintegrar debe haber contado con un apoyo previo que no haya sido revocado');
  const referencia = previos.reduce((a, b) => ((posicion.get(b.convocatoria_id) ?? -1) > (posicion.get(a.convocatoria_id) ?? -1) ? b : a));
  const idxRef = posicion.get(referencia.convocatoria_id) as number;
  const conApoyo = new Set(
    otorgamientos.filter((o) => (ESTADOS_OTORGAMIENTO_COMPROMETEN as readonly string[]).includes(o.estado)).map((o) => o.convocatoria_id),
  );
  let sinApoyo = 0;
  for (let i = idxRef + 1; i < idx; i += 1) {
    const c = orden[i];
    if (c && !conApoyo.has(c.id)) sinApoyo += 1;
  }
  const minimo = await configuracionService.getEntero('ELEGIBILIDAD_REINTEGRO_PERIODOS_SIN_APOYO_MIN', 1);
  if (sinApoyo >= minimo) return { elegible: true, otorgamiento_referencia_id: referencia.id };
  return noElegible(`Para reintegrar debe haber transcurrido al menos ${minimo} periodo(s) sin apoyo desde su ultimo otorgamiento`);
}

/** Puerto listo para `setElegibilidadPort(...)` de postulaciones. */
export const elegibilidadSeguimiento = { validar: validarElegibilidad };
