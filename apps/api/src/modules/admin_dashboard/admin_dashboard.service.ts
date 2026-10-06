import { AppError, logger, supabaseAsUser, type UsuarioAutenticado } from '../../shared';
import { conCache, TTL_DASHBOARD_MS } from './cache';
import { configuracionService } from './configuracion.service';
import type { AlertasQuery, CargaEvaluadoresQuery, MetricasPeriodoQuery } from './admin_dashboard.dto';
import type {
  AlertaDto,
  CargaEvaluador,
  ConvocatoriaConsolidada,
  MetricasPeriodo,
  RespuestaAlertas,
  ResumenAdmin,
} from './admin_dashboard.types';

/**
 * Agregaciones gerenciales: delegan el calculo a funciones SQL (migracion 0009)
 * invocadas con el token del administrador (`supabaseAsUser`), de modo que la
 * guarda `fn_exigir_admin` del lado de la base actue como segunda barrera.
 * Resumen y alertas se cachean 60 s.
 */
async function rpc<T>(user: UsuarioAutenticado, fn: string, args?: Record<string, unknown>): Promise<T> {
  const db = supabaseAsUser(user.token);
  const { data, error } = await db.rpc(fn, args ?? {});
  if (error) {
    logger.error({ err: error, fn }, 'Fallo la funcion de agregacion');
    throw AppError.interno(`No fue posible calcular ${fn}: ${error.message}`);
  }
  return data as T;
}

function parsearPeriodo(p: string): { anio: number; semestre: number } {
  const [a, s] = p.split('-');
  return { anio: Number(a), semestre: Number(s) };
}

/**
 * K-anonimato (DECISIONES section 15): celdas < k se agrupan en "OTROS"; si solo una
 * celda cayo en OTROS, se pliega tambien la menor restante (supresion complementaria)
 * para que la resta contra el total no permita deducirla.
 */
export function aplicarKAnonimato(celdas: Record<string, number> | undefined, k: number): Record<string, number> {
  if (!celdas) return {};
  const entradas = Object.entries(celdas).map(([clave, n]) => [clave, Number(n)] as const);
  const grandes = entradas.filter(([, n]) => n >= k);
  const pequenas = entradas.filter(([, n]) => n < k && n > 0);
  if (pequenas.length === 0) return Object.fromEntries(grandes);
  let agrupadas = [...pequenas];
  let restantes = [...grandes];
  if (agrupadas.length === 1 && restantes.length > 0) {
    restantes.sort((x, y) => x[1] - y[1]);
    const menor = restantes[0];
    if (menor) {
      agrupadas = [...agrupadas, menor];
      restantes = restantes.slice(1);
    }
  }
  const salida: Record<string, number> = Object.fromEntries(restantes);
  salida.OTROS = agrupadas.reduce((acc, [, n]) => acc + n, 0);
  return salida;
}

export const adminDashboardService = {
  async resumen(user: UsuarioAutenticado): Promise<ResumenAdmin> {
    const { valor, desdeCache } = await conCache('admin:resumen', TTL_DASHBOARD_MS, () => rpc<ResumenAdmin>(user, 'fn_admin_resumen'));
    return { ...valor, desde_cache: desdeCache };
  },

  async alertas(user: UsuarioAutenticado, query: AlertasQuery): Promise<RespuestaAlertas> {
    const { valor, desdeCache } = await conCache('admin:alertas', TTL_DASHBOARD_MS, () => rpc<RespuestaAlertas>(user, 'fn_admin_alertas'));
    let alertas: AlertaDto[] = valor.alertas ?? [];
    if (query.codigo) alertas = alertas.filter((a) => a.codigo === query.codigo);
    if (query.severidad) alertas = alertas.filter((a) => a.severidad === query.severidad);
    if (valor.detectores_con_error?.length) {
      logger.warn({ detectores: valor.detectores_con_error }, 'Detectores de alertas con error');
    }
    return { ...valor, alertas, total: alertas.length, desde_cache: desdeCache };
  },

  async convocatorias(user: UsuarioAutenticado): Promise<{ generado_en: string; convocatorias: ConvocatoriaConsolidada[] }> {
    const data = await rpc<{ generado_en: string; convocatorias: Omit<ConvocatoriaConsolidada, 'avance_pct'>[] }>(user, 'fn_admin_convocatorias');
    const convocatorias = (data.convocatorias ?? []).map((c) => ({
      ...c,
      avance_pct: c.total_enviadas > 0 ? Math.round((c.total_resueltas * 100) / c.total_enviadas) : 0,
    }));
    return { generado_en: data.generado_en, convocatorias };
  },

  async metricasPeriodo(user: UsuarioAutenticado, query: MetricasPeriodoQuery): Promise<{ kanon_umbral: number; a: MetricasPeriodo; b: MetricasPeriodo }> {
    const k = await configuracionService.leerEntero('KANON_UMBRAL', 5);
    const pa = parsearPeriodo(query.a);
    const pb = parsearPeriodo(query.b);
    const [a, b] = await Promise.all([
      rpc<MetricasPeriodo>(user, 'fn_admin_metricas_periodo', { p_anio: pa.anio, p_semestre: pa.semestre }),
      rpc<MetricasPeriodo>(user, 'fn_admin_metricas_periodo', { p_anio: pb.anio, p_semestre: pb.semestre }),
    ]);
    const anonimizar = (m: MetricasPeriodo): MetricasPeriodo => {
      if (!m.existe) return m;
      const montos = m.montos ? { ...m.montos } : undefined;
      if (montos && montos.estado === 'disponible' && montos.monto_aprobado_por_beneficio) {
        // El desglose de montos por beneficio sigue a las celdas de postulaciones por beneficio: se
        // suprimen las celdas cuyo conteo quedo agrupado en OTROS.
        const visibles = aplicarKAnonimato(m.postulaciones_por_beneficio, k);
        const porBeneficio = montos.monto_aprobado_por_beneficio as Record<string, number>;
        const filtrado: Record<string, number> = {};
        let otros = 0;
        for (const [cod, monto] of Object.entries(porBeneficio)) {
          if (cod in visibles) filtrado[cod] = Number(monto);
          else otros += Number(monto);
        }
        if (otros > 0) filtrado.OTROS = otros;
        montos.monto_aprobado_por_beneficio = filtrado;
      }
      return {
        ...m,
        postulaciones_por_tipo: aplicarKAnonimato(m.postulaciones_por_tipo, k),
        postulaciones_por_beneficio: aplicarKAnonimato(m.postulaciones_por_beneficio, k),
        montos,
      };
    };
    return { kanon_umbral: k, a: anonimizar(a), b: anonimizar(b) };
  },

  async cargaEvaluadores(user: UsuarioAutenticado, query: CargaEvaluadoresQuery): Promise<{ generado_en: string; periodo: string | null; evaluadores: CargaEvaluador[] }> {
    const args = query.periodo ? { p_anio: parsearPeriodo(query.periodo).anio, p_semestre: parsearPeriodo(query.periodo).semestre } : { p_anio: null, p_semestre: null };
    return rpc(user, 'fn_admin_carga_evaluadores', args);
  },
};
