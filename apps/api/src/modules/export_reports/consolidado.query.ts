import { BENEFICIOS_CATALOGO, type FiltrosConsolidado } from '@foest/shared';
import { AppError, logger, supabaseAdmin } from '../../shared';
import { codigoExpediente } from '../asignaciones';
import type { FilaConsolidado, ResumenConsolidado } from './export_reports.types';
import { instanteADiaBogota, limpiarTexto } from './sanitizacion';

/**
 * Consulta de solo lectura del consolidado. Pagina por bloques (lista de ids y lotes de 100 expedientes)
 * para no cargar todo en una sola respuesta. Las tablas de modulos posteriores (otorgamiento,
 * certificado_labor_social, revision) se leen tolerando su ausencia.
 */
const LOTE_IDS = 100;
const PAGINA_IDS = 1000;

type Obj = Record<string, unknown>;

function tablaInexistente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703' || /does not exist|schema cache/i.test(error.message ?? '');
}

const NOMBRE_BENEFICIO = new Map<string, string>(BENEFICIOS_CATALOGO.map((b) => [b.codigo, b.nombre]));
const TEXTO_TIPO_SOLICITUD: Record<string, string> = { PRIMERA_VEZ: 'Primera vez', RENOVACION: 'Renovación', REINTEGRO: 'Reintegro' };

export interface ConvocatoriaMinima {
  id: string;
  nombre: string;
  anio: number;
  semestre: number;
}

function diaSiguiente(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Ids de los expedientes (sin borradores) que cumplen los filtros, ordenados por fecha de envio. */
export async function listarIdsExpedientes(convocatoriaId: string, filtros: FiltrosConsolidado): Promise<string[]> {
  let permitidosPorBeneficio: Set<string> | null = null;
  if (filtros.beneficio) {
    permitidosPorBeneficio = new Set<string>();
    for (let desde = 0; ; desde += PAGINA_IDS) {
      const { data, error } = await supabaseAdmin
        .from('postulacion_beneficio')
        .select('postulacion_id, postulacion!inner(convocatoria_id)')
        .eq('beneficio_codigo', filtros.beneficio)
        .eq('postulacion.convocatoria_id', convocatoriaId)
        .order('postulacion_id', { ascending: true })
        .range(desde, desde + PAGINA_IDS - 1);
      if (error) throw AppError.interno(`No fue posible filtrar por beneficio: ${error.message}`);
      const filas = (data ?? []) as Array<{ postulacion_id: string }>;
      for (const f of filas) permitidosPorBeneficio.add(f.postulacion_id);
      if (filas.length < PAGINA_IDS) break;
    }
  }

  const ids: string[] = [];
  for (let desde = 0; ; desde += PAGINA_IDS) {
    let q = supabaseAdmin
      .from('postulacion')
      .select('id')
      .eq('convocatoria_id', convocatoriaId)
      .neq('estado', 'BORRADOR');
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    if (filtros.tipo_solicitud) q = q.eq('tipo_solicitud', filtros.tipo_solicitud);
    if (filtros.desde) q = q.gte('enviada_en', `${filtros.desde}T00:00:00-05:00`);
    if (filtros.hasta) q = q.lt('enviada_en', `${diaSiguiente(filtros.hasta)}T00:00:00-05:00`);
    const { data, error } = await q
      .order('enviada_en', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA_IDS - 1);
    if (error) throw AppError.interno(`No fue posible listar los expedientes: ${error.message}`);
    const filas = (data ?? []) as Array<{ id: string }>;
    for (const f of filas) if (!permitidosPorBeneficio || permitidosPorBeneficio.has(f.id)) ids.push(f.id);
    if (filas.length < PAGINA_IDS) break;
  }
  return ids;
}

interface OpcionesSeleccion {
  /** Excluye filas donde esta columna es nula. */
  noNula?: string;
  /** Orden descendente por estas columnas, en este orden. */
  ordenDesc?: string[];
}

async function seleccionar<T>(tabla: string, columnas: string, columnaIn: string, valores: string[], tolerar: boolean, opciones: OpcionesSeleccion = {}): Promise<T[]> {
  if (valores.length === 0) return [];
  let q = supabaseAdmin.from(tabla).select(columnas).in(columnaIn, valores);
  if (opciones.noNula) q = q.not(opciones.noNula, 'is', null);
  for (const col of opciones.ordenDesc ?? []) q = q.order(col, { ascending: false });
  const { data, error } = (await q) as { data: unknown[] | null; error: { code?: string; message: string } | null };
  if (error) {
    if (tolerar && tablaInexistente(error)) {
      logger.debug({ tabla }, 'Tabla opcional no disponible para el consolidado');
      return [];
    }
    throw AppError.interno(`No fue posible leer ${tabla}: ${error.message}`);
  }
  return (data ?? []) as T[];
}

const nombreBeneficio = (codigo: string): string => `${codigo} - ${NOMBRE_BENEFICIO.get(codigo) ?? codigo}`;

/** Ultimos 4 digitos de un numero enmascarado. */
function ultimos4(enmascarado: unknown): string | null {
  if (typeof enmascarado !== 'string') return null;
  const m = enmascarado.match(/(\d{4})\s*$/);
  return m ? (m[1] as string) : null;
}

export function resumenVacio(): ResumenConsolidado {
  return { total: 0, por_estado: {}, por_tipo_solicitud: {}, por_beneficio: {}, monto_aprobado_total: 0 };
}

function acumular(resumen: ResumenConsolidado, estado: string, tipo: string, solicitados: string[], aprobados: Set<string>, monto: number): void {
  resumen.total += 1;
  resumen.por_estado[estado] = (resumen.por_estado[estado] ?? 0) + 1;
  resumen.por_tipo_solicitud[TEXTO_TIPO_SOLICITUD[tipo] ?? tipo] = (resumen.por_tipo_solicitud[TEXTO_TIPO_SOLICITUD[tipo] ?? tipo] ?? 0) + 1;
  for (const b of solicitados) {
    const actual = resumen.por_beneficio[b] ?? { solicitados: 0, aprobados: 0 };
    actual.solicitados += 1;
    if (aprobados.has(b)) actual.aprobados += 1;
    resumen.por_beneficio[b] = actual;
  }
  resumen.monto_aprobado_total += monto;
}

/** Arma las filas de un lote de expedientes (ya filtrados) y acumula el resumen. */
export async function cargarFilasLote(
  convocatoria: ConvocatoriaMinima,
  ids: string[],
  incluirSensibles: boolean,
  resumen: ResumenConsolidado,
): Promise<FilaConsolidado[]> {
  const posts = await seleccionar<Obj>(
    'postulacion',
    'id, beneficiario_id, tipo_solicitud, estado, ciclo, enviada_en, datos_formulario, ' +
      'beneficiario(usuario_id, nombres, apellidos, tipo_documento, numero_documento, celular_1, estrato, sisben_categoria, sisben_puntaje)',
    'id',
    ids,
    false,
  );
  const porId = new Map(posts.map((p) => [p.id as string, p]));

  const usuarioIds = [...new Set(posts.map((p) => (p.beneficiario as Obj | null)?.usuario_id as string | undefined).filter((v): v is string => Boolean(v)))];
  const correos = new Map(
    (await seleccionar<{ id: string; email: string }>('usuario', 'id, email', 'id', usuarioIds, false)).map((u) => [u.id, u.email]),
  );

  const beneficios = await seleccionar<{ postulacion_id: string; beneficio_codigo: string }>('postulacion_beneficio', 'postulacion_id, beneficio_codigo', 'postulacion_id', ids, false);
  const solicitadosPor = new Map<string, string[]>();
  for (const b of beneficios) solicitadosPor.set(b.postulacion_id, [...(solicitadosPor.get(b.postulacion_id) ?? []), b.beneficio_codigo]);

  // Ultima revision decidida por postulacion y sus decisiones por beneficio (evaluacion, 0017).
  const revisiones = await seleccionar<{ id: string; postulacion_id: string; ciclo: number; decidida_en: string | null }>(
    'revision',
    'id, postulacion_id, ciclo, decidida_en',
    'postulacion_id',
    ids,
    true,
    { noNula: 'decidida_en', ordenDesc: ['ciclo', 'decidida_en'] },
  );
  const ultimaRevision = new Map<string, { id: string; decidida_en: string | null }>();
  for (const r of revisiones) if (!ultimaRevision.has(r.postulacion_id)) ultimaRevision.set(r.postulacion_id, r);
  const revisionIds = [...ultimaRevision.values()].map((r) => r.id);
  const decisiones = await seleccionar<{ revision_id: string; beneficio_codigo: string; decision: string; monto_aprobado: number | string | null }>(
    'revision_beneficio',
    'revision_id, beneficio_codigo, decision, monto_aprobado',
    'revision_id',
    revisionIds,
    true,
  );
  const decisionesPorRevision = new Map<string, typeof decisiones>();
  for (const d of decisiones) decisionesPorRevision.set(d.revision_id, [...(decisionesPorRevision.get(d.revision_id) ?? []), d]);

  // Otorgamientos (seguimiento_beneficios): montos vigentes por beneficio, si la tabla existe.
  const otorgamientos = await seleccionar<{ postulacion_id: string; beneficio_codigo: string; monto_aprobado: number | string | null; estado?: string | null }>(
    'otorgamiento',
    'postulacion_id, beneficio_codigo, monto_aprobado, estado',
    'postulacion_id',
    ids,
    true,
  );
  const montoOtorgado = new Map<string, Map<string, number>>();
  for (const o of otorgamientos) {
    if (o.estado === 'REVOCADO') continue;
    const mapa = montoOtorgado.get(o.postulacion_id) ?? new Map<string, number>();
    mapa.set(o.beneficio_codigo, Number(o.monto_aprobado ?? 0));
    montoOtorgado.set(o.postulacion_id, mapa);
  }

  // Horas de labor social acumuladas (ultimo certificado por beneficiario), si la tabla existe.
  const beneficiarioIds = [...new Set(posts.map((p) => p.beneficiario_id as string))];
  const certificados = await seleccionar<{ beneficiario_id: string; total_horas_acumuladas: number | string | null; creado_en: string }>(
    'certificado_labor_social',
    'beneficiario_id, total_horas_acumuladas, creado_en',
    'beneficiario_id',
    beneficiarioIds,
    true,
    { ordenDesc: ['creado_en'] },
  );
  const horasPor = new Map<string, number>();
  for (const c of certificados) if (!horasPor.has(c.beneficiario_id)) horasPor.set(c.beneficiario_id, Number(c.total_horas_acumuladas ?? 0));

  const filas: FilaConsolidado[] = [];
  for (const id of ids) {
    const p = porId.get(id);
    if (!p) continue;
    const ben = (p.beneficiario as Obj | null) ?? {};
    const datos = (p.datos_formulario as Obj | null) ?? {};
    const s4 = (datos.seccion_4 as Obj | undefined) ?? {};
    const s8 = (datos.seccion_8 as Obj | undefined) ?? {};
    const solicitados = (solicitadosPor.get(id) ?? []).sort();
    const rev = ultimaRevision.get(id);
    const dec = rev ? (decisionesPorRevision.get(rev.id) ?? []) : [];
    const aprobados = new Set(dec.filter((d) => d.decision === 'APROBADO').map((d) => d.beneficio_codigo));
    const rechazados = dec.filter((d) => d.decision === 'RECHAZADO').map((d) => d.beneficio_codigo).sort();
    // Monto: otorgamiento vigente por beneficio; si no existe, el monto del dictamen.
    const montos = new Map<string, number>();
    for (const d of dec) if (d.decision === 'APROBADO') montos.set(d.beneficio_codigo, Number(d.monto_aprobado ?? 0));
    for (const [cod, m] of montoOtorgado.get(id) ?? []) montos.set(cod, m);
    const monto = [...montos.values()].reduce((a, b) => a + b, 0);
    const aprobadosFinal = new Set<string>([...aprobados, ...(montoOtorgado.get(id)?.keys() ?? [])]);

    const nombres = [limpiarTexto(ben.nombres), limpiarTexto(ben.apellidos)].filter(Boolean).join(' ');
    const horas = horasPor.get(p.beneficiario_id as string);
    const estrato = ben.estrato === null || ben.estrato === undefined ? null : Number(ben.estrato);
    const puntaje = ben.sisben_puntaje === null || ben.sisben_puntaje === undefined ? null : Number(ben.sisben_puntaje);

    const fila: FilaConsolidado = {
      codigo_expediente: codigoExpediente(convocatoria.anio, convocatoria.semestre, id),
      convocatoria: convocatoria.nombre,
      tipo_solicitud: TEXTO_TIPO_SOLICITUD[p.tipo_solicitud as string] ?? String(p.tipo_solicitud),
      estado: String(p.estado),
      ciclo: Number(p.ciclo ?? 0),
      beneficiario: nombres || null,
      correo: limpiarTexto(correos.get(ben.usuario_id as string)),
      telefono: limpiarTexto(ben.celular_1),
      institucion: limpiarTexto(s4.institucion),
      programa: limpiarTexto(s4.programa),
      semestre: typeof s4.semestre === 'number' ? s4.semestre : null,
      beneficios_solicitados: solicitados.map(nombreBeneficio).join('; ') || null,
      beneficios_aprobados: [...aprobadosFinal].sort().map(nombreBeneficio).join('; ') || null,
      beneficios_rechazados: rechazados.map(nombreBeneficio).join('; ') || null,
      monto_aprobado: montos.size > 0 ? monto : null,
      horas_labor_social: horas ?? null,
      fecha_envio: instanteADiaBogota(p.enviada_en as string | null),
      fecha_dictamen: instanteADiaBogota(rev?.decidida_en ?? null),
    };
    if (incluirSensibles) {
      fila.tipo_documento = limpiarTexto(ben.tipo_documento);
      fila.numero_documento = limpiarTexto(ben.numero_documento);
      fila.estrato = Number.isFinite(estrato) ? estrato : null;
      fila.sisben_categoria = limpiarTexto(ben.sisben_categoria);
      fila.sisben_puntaje = Number.isFinite(puntaje) ? puntaje : null;
      fila.pago_ultimos4 = ultimos4(((s8.datos_pago as Obj | undefined) ?? {}).numero_enmascarado);
    }
    filas.push(fila);
    acumular(resumen, String(p.estado), String(p.tipo_solicitud), solicitados.map(nombreBeneficio), new Set([...aprobadosFinal].map(nombreBeneficio)), monto);
  }
  return filas;
}

export async function cargarTodasLasFilas(
  convocatoria: ConvocatoriaMinima,
  ids: string[],
  incluirSensibles: boolean,
): Promise<{ filas: FilaConsolidado[]; resumen: ResumenConsolidado }> {
  const resumen = resumenVacio();
  const filas: FilaConsolidado[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    filas.push(...(await cargarFilasLote(convocatoria, ids.slice(i, i + LOTE_IDS), incluirSensibles, resumen)));
  }
  return { filas, resumen };
}
