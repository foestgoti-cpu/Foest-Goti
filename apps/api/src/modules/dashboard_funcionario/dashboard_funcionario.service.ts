import { BENEFICIOS_CATALOGO } from '@foest/shared';
import { AppError, logger, supabaseAdmin, type UsuarioAutenticado } from '../../shared';
import { CacheMemoria } from './cache';
import { aplicarKAnonimato } from './kanon';
import type { FiltrosDashboard } from './dashboard_funcionario.dto';
import type {
  AgregadosRpc,
  CeldaConteo,
  ConvocatoriaComite,
  PuntoSerie,
  RespuestaCarga,
  RespuestaConvocatorias,
  RespuestaDistribucion,
  RespuestaResumen,
  RespuestaSerie,
  RespuestaTiempos,
  TotalesResumen,
} from './dashboard_funcionario.types';

/** TTL de la cache de agregados por (usuario, filtros). */
export const CACHE_TTL_MS = 60_000;
/** TTL de la lectura de CONFIG.KANON_UMBRAL. */
const CONFIG_TTL_MS = 5 * 60_000;
const KANON_UMBRAL_DEFECTO = 5;
/** Minimo de miembros del comite para publicar el promedio de carga. */
export const MIN_MIEMBROS_PROMEDIO = 3;
/** Maximo de dias que se rellenan con ceros en la serie temporal. */
const MAX_DIAS_SERIE = 400;

const cacheAgregados = new CacheMemoria<AgregadosRpc>(CACHE_TTL_MS);
const cacheConvocatorias = new CacheMemoria<ConvocatoriaComite[]>(CACHE_TTL_MS);
const cacheConfig = new CacheMemoria<number>(CONFIG_TTL_MS);

const ETIQUETAS_TIPO: Record<string, string> = {
  PRIMERA_VEZ: 'Primera vez',
  RENOVACION: 'Renovacion',
  REINTEGRO: 'Reintegro',
};

const ETIQUETAS_BENEFICIO: Record<string, string> = Object.fromEntries(
  BENEFICIOS_CATALOGO.map((b) => [b.codigo, b.nombre]),
);

export function limpiarCacheDashboard(): void {
  cacheAgregados.limpiar();
  cacheConvocatorias.limpiar();
  cacheConfig.limpiar();
}

function claveCache(user: UsuarioAutenticado, f: FiltrosDashboard): string {
  return `${user.id}|${f.convocatoria_id ?? ''}|${f.desde ?? ''}|${f.hasta ?? ''}`;
}

function agregadosVacios(sello: string | null = null): AgregadosRpc {
  return {
    alcance_invalido: false,
    convocatorias: [],
    resumen: [],
    por_beneficio: [],
    por_tipo_solicitud: [],
    serie: [],
    tiempos: { n: 0, promedio_horas: null, p90_horas: null },
    carga: { propia: { activas: 0, dictaminadas_periodo: 0 }, comite: { activas: 0, dictaminadas_periodo: 0 }, miembros_comite: 0 },
    datos_actualizados_en: sello,
  };
}

async function umbralKAnonimato(): Promise<number> {
  const enCache = cacheConfig.obtener('KANON_UMBRAL');
  if (enCache !== undefined) return enCache;
  let umbral = KANON_UMBRAL_DEFECTO;
  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_sistema')
      .select('valor')
      .eq('clave', 'KANON_UMBRAL')
      .maybeSingle();
    if (!error && data && typeof data.valor === 'string') {
      const n = Number.parseInt(data.valor, 10);
      if (Number.isFinite(n) && n >= 2) umbral = n;
    }
  } catch (e) {
    logger.warn({ err: e }, 'No fue posible leer KANON_UMBRAL; se usa el valor por defecto');
  }
  cacheConfig.guardar('KANON_UMBRAL', umbral);
  return umbral;
}

/**
 * Obtiene (o sirve desde cache) los agregados del comite del funcionario.
 * - `convocatoria_id` fuera del comite -> 404 (oculta existencia, DECISIONES section 2).
 * - Sin asignaciones -> ceros (nunca 500).
 */
async function obtenerAgregados(user: UsuarioAutenticado, filtros: FiltrosDashboard): Promise<AgregadosRpc> {
  const clave = claveCache(user, filtros);
  const enCache = cacheAgregados.obtener(clave);
  if (enCache) return enCache;

  const { data, error } = await supabaseAdmin.rpc('fn_metricas_funcionario', {
    p_funcionario: user.id,
    p_convocatoria: filtros.convocatoria_id ?? null,
    p_desde: filtros.desde ?? null,
    p_hasta: filtros.hasta ?? null,
  });
  if (error) {
    logger.error({ err: error, usuario: user.id }, 'fn_metricas_funcionario fallo');
    throw AppError.interno('No fue posible calcular las metricas del comite');
  }
  const crudo = (data ?? null) as Partial<AgregadosRpc> | null;
  if (!crudo) {
    const vacio = agregadosVacios();
    cacheAgregados.guardar(clave, vacio);
    return vacio;
  }
  if (crudo.alcance_invalido) throw AppError.noEncontrado();

  const agregados: AgregadosRpc = { ...agregadosVacios(crudo.datos_actualizados_en ?? null), ...crudo, alcance_invalido: false };
  cacheAgregados.guardar(clave, agregados);
  return agregados;
}

function distribucion(celdas: CeldaConteo[], umbral: number, etiquetas: Record<string, string>, sello: string | null): RespuestaDistribucion {
  const r = aplicarKAnonimato(celdas, umbral);
  return {
    datos_actualizados_en: sello,
    items: r.items.map((c) => ({
      clave: c.clave,
      etiqueta: c.agrupado ? c.clave : (etiquetas[c.clave] ?? c.clave),
      total: c.total,
      agrupado: c.agrupado,
    })),
    suprimido: r.suprimido,
    celdas_agrupadas: r.celdas_agrupadas,
    umbral,
  };
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Rellena con ceros los dias sin envios cuando el rango esta acotado y es razonable. */
function rellenarSerie(puntos: PuntoSerie[], desde?: string, hasta?: string): PuntoSerie[] {
  const ordenados = [...puntos].sort((a, b) => a.dia.localeCompare(b.dia));
  const inicio = desde ?? ordenados[0]?.dia;
  const fin = hasta ?? ordenados[ordenados.length - 1]?.dia;
  if (!inicio || !fin || inicio > fin) return ordenados;
  const dias = Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1;
  if (dias > MAX_DIAS_SERIE) return ordenados;
  const porDia = new Map(ordenados.map((p) => [p.dia, p.total]));
  const salida: PuntoSerie[] = [];
  for (let i = 0; i < dias; i += 1) {
    const dia = sumarDias(inicio, i);
    salida.push({ dia, total: porDia.get(dia) ?? 0 });
  }
  return salida;
}

export const dashboardFuncionarioService = {
  async resumen(user: UsuarioAutenticado, filtros: FiltrosDashboard): Promise<RespuestaResumen> {
    const a = await obtenerAgregados(user, filtros);
    const porEstado = new Map((a.resumen ?? []).map((f) => [f.estado, Number(f.total) || 0]));
    const totales: TotalesResumen = {
      asignadas: 0,
      pendientes: porEstado.get('PENDIENTE') ?? 0,
      en_evaluacion: porEstado.get('EN_EVALUACION') ?? 0,
      en_correccion: porEstado.get('EN_CORRECCION') ?? 0,
      aprobadas: porEstado.get('APROBADA') ?? 0,
      rechazadas: porEstado.get('RECHAZADA') ?? 0,
      desistidas: porEstado.get('DESISTIDA') ?? 0,
    };
    totales.asignadas = [...porEstado.values()].reduce((acc, n) => acc + n, 0);
    return { datos_actualizados_en: a.datos_actualizados_en, convocatorias: a.convocatorias, totales };
  },

  async porBeneficio(user: UsuarioAutenticado, filtros: FiltrosDashboard): Promise<RespuestaDistribucion> {
    const [a, umbral] = await Promise.all([obtenerAgregados(user, filtros), umbralKAnonimato()]);
    return distribucion(a.por_beneficio ?? [], umbral, ETIQUETAS_BENEFICIO, a.datos_actualizados_en);
  },

  async porTipoSolicitud(user: UsuarioAutenticado, filtros: FiltrosDashboard): Promise<RespuestaDistribucion> {
    const [a, umbral] = await Promise.all([obtenerAgregados(user, filtros), umbralKAnonimato()]);
    return distribucion(a.por_tipo_solicitud ?? [], umbral, ETIQUETAS_TIPO, a.datos_actualizados_en);
  },

  async serieTemporal(user: UsuarioAutenticado, filtros: FiltrosDashboard): Promise<RespuestaSerie> {
    const a = await obtenerAgregados(user, filtros);
    const items = rellenarSerie(
      (a.serie ?? []).map((p) => ({ dia: p.dia, total: Number(p.total) || 0 })),
      filtros.desde,
      filtros.hasta,
    );
    return { datos_actualizados_en: a.datos_actualizados_en, desde: filtros.desde ?? null, hasta: filtros.hasta ?? null, items };
  },

  async tiemposRevision(user: UsuarioAutenticado, filtros: FiltrosDashboard): Promise<RespuestaTiempos> {
    const [a, umbral] = await Promise.all([obtenerAgregados(user, filtros), umbralKAnonimato()]);
    const t = a.tiempos ?? { n: 0, promedio_horas: null, p90_horas: null };
    const n = Number(t.n) || 0;
    const sinDatos = n === 0;
    const suprimido = !sinDatos && n < umbral;
    const publicar = !sinDatos && !suprimido;
    return {
      datos_actualizados_en: a.datos_actualizados_en,
      n,
      promedio_horas: publicar && t.promedio_horas !== null ? Number(t.promedio_horas) : null,
      p90_horas: publicar && t.p90_horas !== null ? Number(t.p90_horas) : null,
      sin_datos: sinDatos,
      suprimido,
      umbral,
    };
  },

  async carga(user: UsuarioAutenticado, filtros: FiltrosDashboard): Promise<RespuestaCarga> {
    const a = await obtenerAgregados(user, filtros);
    const c = a.carga ?? agregadosVacios().carga!;
    const miembros = Number(c.miembros_comite) || 0;
    const propia = { activas: Number(c.propia?.activas) || 0, dictaminadas_periodo: Number(c.propia?.dictaminadas_periodo) || 0 };
    const promedio =
      miembros >= MIN_MIEMBROS_PROMEDIO
        ? {
            activas: Math.round(((Number(c.comite?.activas) || 0) / miembros) * 100) / 100,
            dictaminadas_periodo: Math.round(((Number(c.comite?.dictaminadas_periodo) || 0) / miembros) * 100) / 100,
          }
        : null;
    return { datos_actualizados_en: a.datos_actualizados_en, propia, promedio_comite: promedio, miembros_comite: miembros };
  },

  async convocatorias(user: UsuarioAutenticado): Promise<RespuestaConvocatorias> {
    const enCache = cacheConvocatorias.obtener(user.id);
    if (enCache) return { items: enCache };
    const { data, error } = await supabaseAdmin.rpc('fn_convocatorias_funcionario', { p_funcionario: user.id });
    if (error) {
      logger.error({ err: error, usuario: user.id }, 'fn_convocatorias_funcionario fallo');
      throw AppError.interno('No fue posible consultar las convocatorias del comite');
    }
    const items = ((data ?? []) as ConvocatoriaComite[]).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      anio: Number(c.anio),
      semestre: Number(c.semestre),
      estado: c.estado,
    }));
    cacheConvocatorias.guardar(user.id, items);
    return { items };
  },
};
