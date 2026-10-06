import { createHash } from 'node:crypto';
import type { ErrorFilaSnies, IesSnies, ImportacionSnies, Paginado, PaginacionQuery, ProgramaSnies, ResumenImportacionSnies, SniesBusquedaQuery } from '@foest/shared';
import { AppError, auditar, paginar, rangoSupabase, supabaseAdmin, supabaseAsUser, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { parsearCsv } from './snies.csv';
import {
  CAMPOS_OBLIGATORIOS,
  mapearCaracter,
  mapearEstado,
  mapearModalidad,
  mapearNivel,
  mapearSector,
  normalizarTexto,
  resolverColumnas,
  type CampoSnies,
} from './snies.mapping';
import type { FilaSniesNormalizada } from './catalogos_configuracion.types';

/**
 * Catalogo SNIES (IES y programas). Busquedas con el token del usuario (RLS:
 * lectura para autenticados) sobre `nombre_normalizado` (indice pg_trgm), LIMIT 50.
 * Importacion (script y endpoint comparten `importar`): normalizacion, upsert por
 * codigo_snies, desactivacion (nunca borrado) de programas ausentes y registro en
 * `importacion_snies` con errores por fila. `modo = 'simulacion'` no escribe.
 */
const LOTE = 500;
const MAX_ERRORES = 500;

function filtroTexto<T extends { ilike: (c: string, v: string) => T; or: (f: string) => T }>(q: T, texto: string | undefined): T {
  const t = normalizarTexto(texto).replace(/[,%()]/g, '');
  if (!t) return q;
  if (/^\d+$/.test(t)) return q.ilike('codigo_snies', `${t}%`);
  return q.or(`nombre_normalizado.ilike.${t}%,nombre_normalizado.ilike.% ${t}%`);
}

async function leerTodosLosCodigos(tabla: 'ies_snies' | 'programa_snies', columnas: string): Promise<Array<Record<string, unknown>>> {
  const filas: Array<Record<string, unknown>> = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabaseAdmin.from(tabla).select(columnas).range(desde, desde + 999);
    if (error) throw AppError.interno(`No fue posible leer ${tabla}: ${error.message}`);
    const lote = (data ?? []) as unknown as Array<Record<string, unknown>>;
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  return filas;
}

function trozos<T>(lista: T[], tam: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += tam) r.push(lista.slice(i, i + tam));
  return r;
}

export function normalizarFilas(contenido: string): { filas: FilaSniesNormalizada[]; errores: ErrorFilaSnies[]; filas_leidas: number } {
  const { encabezados, filas } = parsearCsv(contenido);
  const columnas = resolverColumnas(encabezados);
  const faltan = CAMPOS_OBLIGATORIOS.filter((c) => columnas[c] === undefined);
  if (faltan.length > 0) {
    throw AppError.datosInvalidos('CSV_ENCABEZADOS_INVALIDOS', `El CSV no tiene las columnas obligatorias: ${faltan.join(', ')}`, {
      faltan,
      encabezados,
    });
  }
  const col = (fila: string[], campo: CampoSnies): string => {
    const idx = columnas[campo];
    return idx === undefined ? '' : (fila[idx] ?? '').trim();
  };
  const normalizadas: FilaSniesNormalizada[] = [];
  const errores: ErrorFilaSnies[] = [];
  for (const f of filas) {
    const iesCodigo = col(f.valores, 'ies_codigo').replace(/\D/g, '');
    const progCodigo = col(f.valores, 'programa_codigo').replace(/\D/g, '');
    const iesNombre = col(f.valores, 'ies_nombre');
    const progNombre = col(f.valores, 'programa_nombre');
    const problemas: string[] = [];
    if (!iesCodigo) problemas.push('codigo de IES vacio o no numerico');
    if (!iesNombre) problemas.push('nombre de IES vacio');
    if (!progCodigo) problemas.push('codigo SNIES del programa vacio o no numerico');
    if (!progNombre) problemas.push('nombre del programa vacio');
    if (problemas.length > 0) {
      if (errores.length < MAX_ERRORES) errores.push({ fila: f.numero, mensaje: problemas.join('; ') });
      continue;
    }
    const departamento = col(f.valores, 'departamento') || null;
    const municipio = col(f.valores, 'municipio') || null;
    normalizadas.push({
      ies: {
        codigo_snies: iesCodigo,
        nombre: iesNombre,
        nombre_normalizado: normalizarTexto(iesNombre),
        caracter: mapearCaracter(col(f.valores, 'ies_caracter')),
        sector: mapearSector(col(f.valores, 'ies_sector')),
        departamento,
        municipio,
      },
      programa: {
        codigo_snies: progCodigo,
        ies_codigo: iesCodigo,
        nombre: progNombre,
        nombre_normalizado: normalizarTexto(progNombre),
        nivel: mapearNivel(col(f.valores, 'nivel')),
        modalidad: mapearModalidad(col(f.valores, 'modalidad')),
        estado_programa: mapearEstado(col(f.valores, 'estado')),
        departamento_oferta: departamento,
        municipio_oferta: municipio,
      },
    });
  }
  return { filas: normalizadas, errores, filas_leidas: filas.length };
}

export const sniesService = {
  async buscarIes(user: UsuarioAutenticado, query: SniesBusquedaQuery): Promise<Paginado<IesSnies>> {
    const db = supabaseAsUser(user.token);
    const p: PaginacionQuery = { page: query.page, page_size: query.page_size };
    const { desde, hasta } = rangoSupabase(p);
    let q = db.from('ies_snies').select('*', { count: 'exact' }).eq('activa', true).order('nombre').range(desde, hasta);
    q = filtroTexto(q, query.q);
    const { data, error, count } = await q;
    if (error) throw AppError.interno(`No fue posible buscar instituciones: ${error.message}`);
    return paginar((data ?? []) as IesSnies[], p, count ?? 0);
  },

  async programasDeIes(user: UsuarioAutenticado, iesCodigo: string, query: SniesBusquedaQuery): Promise<Paginado<ProgramaSnies>> {
    const db = supabaseAsUser(user.token);
    const { data: ies, error: errIes } = await db.from('ies_snies').select('codigo_snies').eq('codigo_snies', iesCodigo).maybeSingle();
    if (errIes) throw AppError.interno(`No fue posible consultar la institucion: ${errIes.message}`);
    if (!ies) throw AppError.noEncontrado('IES_NO_ENCONTRADA', 'La institucion no existe en el catalogo SNIES');
    const p: PaginacionQuery = { page: query.page, page_size: query.page_size };
    const { desde, hasta } = rangoSupabase(p);
    let q = db.from('programa_snies').select('*', { count: 'exact' }).eq('ies_codigo', iesCodigo).eq('activo', true).order('nombre').range(desde, hasta);
    q = filtroTexto(q, query.q);
    const { data, error, count } = await q;
    if (error) throw AppError.interno(`No fue posible buscar programas: ${error.message}`);
    return paginar((data ?? []) as ProgramaSnies[], p, count ?? 0);
  },

  /** Detalle de un programa activo con su IES. 404 si no existe o esta inactivo. */
  async detallePrograma(user: UsuarioAutenticado, codigo: string): Promise<ProgramaSnies & { ies: IesSnies | null }> {
    const db = supabaseAsUser(user.token);
    const { data, error } = await db.from('programa_snies').select('*').eq('codigo_snies', codigo).maybeSingle();
    if (error) throw AppError.interno(`No fue posible consultar el programa: ${error.message}`);
    if (!data) throw AppError.noEncontrado('PROGRAMA_NO_ENCONTRADO', 'El programa no existe en el catalogo SNIES');
    const programa = data as ProgramaSnies;
    if (!programa.activo) throw AppError.noEncontrado('PROGRAMA_INACTIVO', 'El programa no esta activo en el catalogo SNIES');
    const { data: ies } = await db.from('ies_snies').select('*').eq('codigo_snies', programa.ies_codigo).maybeSingle();
    return { ...programa, ies: (ies as IesSnies | null) ?? null };
  },

  /** Verificacion para otros modulos (postulaciones): par IES/programa existente y activo. */
  async existeProgramaActivo(codigoPrograma: string, codigoIes?: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin.from('programa_snies').select('codigo_snies, ies_codigo, activo').eq('codigo_snies', codigoPrograma).maybeSingle();
    if (error) throw AppError.interno(`No fue posible verificar el programa: ${error.message}`);
    const p = data as { ies_codigo: string; activo: boolean } | null;
    if (!p || !p.activo) return false;
    return codigoIes === undefined || p.ies_codigo === codigoIes;
  },

  async importar(
    contenido: string,
    opciones: { archivo_nombre: string; modo: 'real' | 'simulacion'; actor: Pick<UsuarioAutenticado, 'id'> | null },
    contexto: Partial<EventoAuditoria>,
  ): Promise<ResumenImportacionSnies> {
    const { filas, errores, filas_leidas } = normalizarFilas(contenido);
    if (filas.length === 0) {
      throw AppError.datosInvalidos('CSV_SIN_FILAS_VALIDAS', 'El archivo no contiene filas validas', { errores: errores.slice(0, 20) });
    }
    const sha256 = createHash('sha256').update(contenido).digest('hex');

    // Ultima aparicion gana (el MEN repite filas por sede/extension).
    const iesMap = new Map<string, FilaSniesNormalizada['ies']>();
    const progMap = new Map<string, FilaSniesNormalizada['programa']>();
    for (const f of filas) {
      iesMap.set(f.ies.codigo_snies, f.ies);
      progMap.set(f.programa.codigo_snies, f.programa);
    }

    const iesExistentes = new Set((await leerTodosLosCodigos('ies_snies', 'codigo_snies')).map((r) => String(r.codigo_snies)));
    const progExistentes = await leerTodosLosCodigos('programa_snies', 'codigo_snies, activo');
    const progCodigosExistentes = new Set(progExistentes.map((r) => String(r.codigo_snies)));
    const activosExistentes = progExistentes.filter((r) => r.activo === true).map((r) => String(r.codigo_snies));
    const aDesactivar = activosExistentes.filter((c) => !progMap.has(c));

    let iesIns = 0;
    let iesAct = 0;
    for (const c of iesMap.keys()) iesExistentes.has(c) ? iesAct++ : iesIns++;
    let ins = 0;
    let act = 0;
    for (const c of progMap.keys()) progCodigosExistentes.has(c) ? act++ : ins++;

    const resumen: ResumenImportacionSnies = {
      modo: opciones.modo === 'simulacion' ? 'SIMULACION' : 'REAL',
      ies_insertadas: iesIns,
      ies_actualizadas: iesAct,
      insertados: ins,
      actualizados: act,
      desactivados: aDesactivar.length,
      filas_leidas,
      errores,
      importacion_id: null,
    };
    if (opciones.modo === 'simulacion') return resumen;

    const ahora = new Date().toISOString();
    for (const lote of trozos([...iesMap.values()], LOTE)) {
      const { error } = await supabaseAdmin
        .from('ies_snies')
        .upsert(lote.map((i) => ({ ...i, activa: true, actualizado_en: ahora })), { onConflict: 'codigo_snies' });
      if (error) throw AppError.interno(`No fue posible guardar las instituciones: ${error.message}`);
    }
    for (const lote of trozos([...progMap.values()], LOTE)) {
      const { error } = await supabaseAdmin
        .from('programa_snies')
        .upsert(lote.map((p) => ({ ...p, activo: p.estado_programa === 'ACTIVO', actualizado_en: ahora })), { onConflict: 'codigo_snies' });
      if (error) throw AppError.interno(`No fue posible guardar los programas: ${error.message}`);
    }
    for (const lote of trozos(aDesactivar, LOTE)) {
      const { error } = await supabaseAdmin.from('programa_snies').update({ activo: false, actualizado_en: ahora }).in('codigo_snies', lote);
      if (error) throw AppError.interno(`No fue posible desactivar programas ausentes: ${error.message}`);
    }

    const { data: imp, error: errImp } = await supabaseAdmin
      .from('importacion_snies')
      .insert({
        admin_id: opciones.actor?.id ?? null,
        archivo_nombre: opciones.archivo_nombre,
        sha256_archivo: sha256,
        modo: 'REAL',
        insertados: ins,
        actualizados: act,
        desactivados: aDesactivar.length,
        errores,
      })
      .select('id')
      .single();
    if (errImp) throw AppError.interno(`No fue posible registrar la importacion: ${errImp.message}`);
    resumen.importacion_id = (imp as { id: string }).id;

    await auditar({
      ...contexto,
      accion: 'CREAR',
      entidad: 'CATALOGO_SNIES',
      entidad_id: resumen.importacion_id,
      datos_despues: { archivo_nombre: opciones.archivo_nombre, sha256_archivo: sha256, insertados: ins, actualizados: act, desactivados: aDesactivar.length, errores: errores.length },
    });
    return resumen;
  },

  async importaciones(user: UsuarioAutenticado, p: PaginacionQuery): Promise<Paginado<ImportacionSnies>> {
    const db = supabaseAsUser(user.token);
    const { desde, hasta } = rangoSupabase(p);
    const { data, error, count } = await db.from('importacion_snies').select('*', { count: 'exact' }).order('ejecutada_en', { ascending: false }).range(desde, hasta);
    if (error) throw AppError.interno(`No fue posible consultar las importaciones: ${error.message}`);
    return paginar((data ?? []) as ImportacionSnies[], p, count ?? 0);
  },
};
