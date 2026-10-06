import {
  CATEGORIAS_CON_CONFIRMACION,
  CLAVES_CONFIGURACION_PUBLICA,
  CLAVES_NO_EDITABLES,
  type ClaveConfiguracion,
  type ConfiguracionActualizar,
  type ConfiguracionItem,
  type ConfiguracionListarQuery,
  type Paginado,
} from '@foest/shared';
import { AppError, auditar, supabaseAdmin, supabaseAsUser, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { definicionDeClave } from './configuracion.defaults';
import type { ConfiguracionPublica } from './catalogos_configuracion.types';

/**
 * Configuracion del sistema (catalogos_configuracion.md).
 *
 * - Lectura administrativa con el token del usuario (RLS: configuracion_select).
 * - Escritura con service_role tras requirePermission('configuracion:editar'),
 *   bloqueo optimista por `version` (409 VERSION_DESACTUALIZADA), validacion por
 *   tipo y rango (422 VALOR_FUERA_DE_RANGO / VALOR_INVALIDO), confirmacion
 *   explicita en JURIDICO/SEGURIDAD/DOCUMENTOS (422 CONFIRMACION_REQUERIDA) y
 *   auditoria CONFIGURACION con datos_antes/datos_despues.
 * - Lectura tipada interna (`get`, `getEntero`, `getBool`, `getFecha`) con cache en
 *   memoria (TTL 60 s de respaldo) invalidada al escribir. SUPUESTO: no hay Redis
 *   en la infraestructura (DECISIONES seccion 19); en multi-instancia el TTL de
 *   60 s acota la ventana de inconsistencia. Otros modulos se suscriben con
 *   `suscribirCambios` para invalidar sus propias caches.
 */
const TTL_CONFIG_MS = 60_000;
const cacheInterna = new Map<string, { valor: string | null; vence: number }>();
const oyentes = new Set<(clave: string) => void>();

const CATEGORIAS_CONFIRMACION = new Set<string>(CATEGORIAS_CON_CONFIRMACION);
const NO_EDITABLES = new Set<string>(CLAVES_NO_EDITABLES);

export function serializarValor(item: Pick<ConfiguracionItem, 'clave' | 'tipo' | 'valor_min' | 'valor_max'>, entrada: unknown): string | null {
  const invalido = (msg: string, code = 'VALOR_INVALIDO') => AppError.datosInvalidos(code, msg, { clave: item.clave, tipo: item.tipo });
  if (entrada === null || entrada === '') {
    if (item.tipo === 'DATE' || item.tipo === 'TEXT' || item.tipo === 'STRING' || item.tipo === 'JSON') return null;
    throw invalido('El valor es obligatorio para este tipo');
  }
  switch (item.tipo) {
    case 'INT': {
      const n = typeof entrada === 'number' ? entrada : Number(String(entrada).trim());
      if (!Number.isInteger(n)) throw invalido('Se esperaba un numero entero');
      const min = item.valor_min != null ? Number(item.valor_min) : null;
      const max = item.valor_max != null ? Number(item.valor_max) : null;
      if ((min !== null && n < min) || (max !== null && n > max)) {
        throw AppError.datosInvalidos('VALOR_FUERA_DE_RANGO', `El valor debe estar entre ${min ?? '-inf'} y ${max ?? '+inf'}`, {
          clave: item.clave,
          valor_min: min,
          valor_max: max,
        });
      }
      return String(n);
    }
    case 'BOOL': {
      if (typeof entrada === 'boolean') return entrada ? 'true' : 'false';
      const s = String(entrada).trim().toLowerCase();
      if (s === 'true' || s === 'false') return s;
      throw invalido('Se esperaba true o false');
    }
    case 'DATE': {
      const s = String(entrada).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw invalido('Se esperaba una fecha YYYY-MM-DD');
      return s;
    }
    case 'JSON': {
      const s = typeof entrada === 'string' ? entrada : JSON.stringify(entrada);
      try {
        JSON.parse(s);
      } catch {
        throw invalido('Se esperaba JSON valido');
      }
      return s;
    }
    case 'STRING':
    case 'TEXT': {
      if (typeof entrada !== 'string') throw invalido('Se esperaba texto');
      const s = entrada.trim();
      if (item.tipo === 'STRING' && s.length > 200) throw invalido('Maximo 200 caracteres');
      return s;
    }
    default:
      throw invalido('Tipo de configuracion desconocido');
  }
}

/** Regla adicional: SUBSANACION_DIAS_HABILES no puede superar SUBSANACION_DIAS_HABILES_MAX. */
async function validarDependencias(clave: string, valorNuevo: string | null): Promise<void> {
  if (clave === 'SUBSANACION_DIAS_HABILES' && valorNuevo !== null) {
    const max = await configuracionService.getEntero('SUBSANACION_DIAS_HABILES_MAX');
    if (Number(valorNuevo) > max) {
      throw AppError.datosInvalidos('VALOR_FUERA_DE_RANGO', `El valor no puede superar SUBSANACION_DIAS_HABILES_MAX (${max})`, {
        clave,
        valor_min: 1,
        valor_max: max,
      });
    }
  }
}

function notificarCambio(clave: string): void {
  cacheInterna.delete(clave);
  for (const o of oyentes) {
    try {
      o(clave);
    } catch {
      // Un oyente defectuoso no debe afectar la escritura.
    }
  }
}

export const configuracionService = {
  async listar(user: UsuarioAutenticado, query: ConfiguracionListarQuery): Promise<Paginado<ConfiguracionItem>> {
    const db = supabaseAsUser(user.token);
    let q = db.from('configuracion_sistema').select('*', { count: 'exact' }).order('categoria').order('clave');
    if (query.categoria) q = q.eq('categoria', query.categoria);
    const { data, error, count } = await q;
    if (error) throw AppError.interno(`No fue posible consultar la configuracion: ${error.message}`);
    const filas = (data ?? []) as ConfiguracionItem[];
    return { data: filas, page: 1, page_size: Math.max(filas.length, 1), total: count ?? filas.length };
  },

  async obtener(user: UsuarioAutenticado, clave: string): Promise<ConfiguracionItem> {
    const db = supabaseAsUser(user.token);
    const { data, error } = await db.from('configuracion_sistema').select('*').eq('clave', clave).maybeSingle();
    if (error) throw AppError.interno(`No fue posible consultar la clave: ${error.message}`);
    if (!data) throw AppError.noEncontrado('CLAVE_NO_ENCONTRADA', 'La clave de configuracion no existe');
    return data as ConfiguracionItem;
  },

  async actualizar(
    user: UsuarioAutenticado,
    clave: string,
    cuerpo: ConfiguracionActualizar,
    contexto: Partial<EventoAuditoria>,
  ): Promise<ConfiguracionItem> {
    if (NO_EDITABLES.has(clave)) {
      throw AppError.datosInvalidos('CLAVE_NO_EDITABLE', 'Esta clave solo cambia al publicar una nueva version');
    }
    const actual = await this.obtener(user, clave);
    if (actual.version !== cuerpo.version) {
      throw AppError.conflicto('VERSION_DESACTUALIZADA', 'La configuracion fue modificada por otro usuario; recargue y vuelva a intentarlo', {
        clave,
        version_actual: actual.version,
        valor_actual: actual.valor,
        actualizado_en: actual.actualizado_en,
      });
    }
    if (CATEGORIAS_CONFIRMACION.has(actual.categoria) && cuerpo.confirmar !== true) {
      throw AppError.datosInvalidos('CONFIRMACION_REQUERIDA', `Los cambios en la categoria ${actual.categoria} exigen confirmar: true`, { categoria: actual.categoria });
    }
    const valorNuevo = serializarValor(actual, cuerpo.valor);
    await validarDependencias(clave, valorNuevo);

    const { data, error } = await supabaseAdmin
      .from('configuracion_sistema')
      .update({ valor: valorNuevo, version: actual.version + 1, actualizado_por: user.id, actualizado_en: new Date().toISOString() })
      .eq('clave', clave)
      .eq('version', cuerpo.version)
      .select('*')
      .maybeSingle();
    if (error) throw AppError.interno(`No fue posible actualizar la configuracion: ${error.message}`);
    if (!data) {
      throw AppError.conflicto('VERSION_DESACTUALIZADA', 'La configuracion cambio durante la actualizacion; recargue y vuelva a intentarlo', { clave });
    }
    const nuevo = data as ConfiguracionItem;

    await auditar({
      ...contexto,
      accion: 'CONFIGURACION',
      entidad: 'CONFIGURACION',
      entidad_id: clave,
      datos_antes: { clave, valor: actual.valor, version: actual.version },
      datos_despues: { clave, valor: nuevo.valor, version: nuevo.version },
      metadatos: { motivo: cuerpo.motivo ?? null, categoria: actual.categoria, confirmado: cuerpo.confirmar === true },
    });

    notificarCambio(clave);
    return nuevo;
  },

  /** Subconjunto no sensible (lectura con service_role: cualquier rol autenticado). */
  async publica(): Promise<ConfiguracionPublica> {
    const claves = [...CLAVES_CONFIGURACION_PUBLICA];
    const { data, error } = await supabaseAdmin.from('configuracion_sistema').select('clave, valor').in('clave', claves);
    if (error) throw AppError.interno(`No fue posible leer la configuracion publica: ${error.message}`);
    const filas = (data ?? []) as Array<{ clave: string; valor: string | null }>;
    const valores: Record<string, string | null> = {};
    for (const clave of claves) {
      const fila = filas.find((f) => f.clave === clave);
      valores[clave] = fila ? fila.valor : (definicionDeClave(clave)?.defecto ?? null);
    }
    return { generado_en: new Date().toISOString(), valores };
  },

  // --- Lectura tipada interna (hot paths de otros modulos) ---------------------

  /** Lectura interna (service_role) con cache 60 s. Devuelve el valor crudo o el defecto del catalogo. */
  async get(clave: ClaveConfiguracion | string): Promise<string | null> {
    const ahora = Date.now();
    const c = cacheInterna.get(clave);
    if (c && c.vence > ahora) return c.valor;
    const { data, error } = await supabaseAdmin.from('configuracion_sistema').select('valor').eq('clave', clave).maybeSingle();
    if (error) throw AppError.interno(`No fue posible leer la configuracion ${clave}: ${error.message}`);
    const valor = data ? ((data.valor as string | null | undefined) ?? null) : (definicionDeClave(clave)?.defecto ?? null);
    cacheInterna.set(clave, { valor, vence: ahora + TTL_CONFIG_MS });
    return valor;
  },

  /** Alias historico usado por admin_dashboard. */
  async leerValor(clave: string): Promise<string | null> {
    return this.get(clave);
  },

  async getEntero(clave: ClaveConfiguracion | string, defecto?: number): Promise<number> {
    const v = await this.get(clave);
    const n = v == null || v.trim() === '' ? NaN : Number(v);
    if (Number.isFinite(n)) return n;
    if (defecto !== undefined) return defecto;
    const d = definicionDeClave(clave)?.defecto;
    const nd = d == null ? NaN : Number(d);
    return Number.isFinite(nd) ? nd : 0;
  },

  /** Alias historico usado por admin_dashboard. */
  async leerEntero(clave: string, defecto: number): Promise<number> {
    return this.getEntero(clave, defecto);
  },

  async getBool(clave: ClaveConfiguracion | string, defecto = false): Promise<boolean> {
    const v = await this.get(clave);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return defecto;
  },

  /** Fecha local YYYY-MM-DD o null. */
  async getFecha(clave: ClaveConfiguracion | string): Promise<string | null> {
    const v = await this.get(clave);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  },

  /** Permite a otros modulos invalidar sus caches cuando cambia una clave. Devuelve la funcion para desuscribirse. */
  suscribirCambios(oyente: (clave: string) => void): () => void {
    oyentes.add(oyente);
    return () => oyentes.delete(oyente);
  },

  /** Invalida la cache local (y avisa a los oyentes). Usada tambien al publicar versiones. */
  invalidar(clave?: string): void {
    if (clave) {
      notificarCambio(clave);
      return;
    }
    const claves = [...cacheInterna.keys()];
    cacheInterna.clear();
    for (const k of claves) notificarCambio(k);
  },

  __limpiarCacheParaPruebas(): void {
    cacheInterna.clear();
  },
};
