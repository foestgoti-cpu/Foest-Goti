import type { Paginado } from '@foest/shared';
import { AppError, auditar, supabaseAdmin, supabaseAsUser, type EventoAuditoria, type UsuarioAutenticado } from '../../shared';
import { invalidarCache } from './cache';
import type { ConfiguracionActualizar, ConfiguracionListarQuery } from './admin_dashboard.dto';
import type { ConfiguracionItem } from './admin_dashboard.types';

/**
 * Endpoints minimos de configuracion (catalogos_configuracion.md) implementados
 * en este lote por admin_dashboard. Cuando exista el modulo catalogos_configuracion,
 * este servicio se retira y el web apunta a las mismas rutas.
 *
 * - Lectura con el token del administrador (RLS: configuracion_select).
 * - Escritura con service_role tras requirePermission('configuracion:editar'),
 *   bloqueo optimista por `version` (409 VERSION_DESACTUALIZADA) y auditoria CONFIGURACION.
 * - Cache en memoria de lecturas internas (umbrales), invalidada al escribir.
 */

/** Claves que no se editan con PUT (se alimentan al publicar versiones). */
const CLAVES_NO_EDITABLES = new Set(['CONSENTIMIENTO_TEXTO_VERSION_VIGENTE']);
/** Categorias cuyo cambio exige confirmacion explicita (doble intencion). */
const CATEGORIAS_CON_CONFIRMACION = new Set(['JURIDICO', 'SEGURIDAD', 'DOCUMENTOS']);

const cacheInterna = new Map<string, { valor: string | null; vence: number }>();
const TTL_CONFIG_MS = 60_000;

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
    if (CLAVES_NO_EDITABLES.has(clave)) {
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
    if (CATEGORIAS_CON_CONFIRMACION.has(actual.categoria) && cuerpo.confirmar !== true) {
      throw AppError.datosInvalidos('CONFIRMACION_REQUERIDA', `Los cambios en la categoria ${actual.categoria} exigen confirmar: true`, { categoria: actual.categoria });
    }
    const valorNuevo = serializarValor(actual, cuerpo.valor);

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

    cacheInterna.delete(clave);
    invalidarCache('admin:');
    return nuevo;
  },

  /** Lectura interna (service_role) con cache 60 s; usada por el dashboard para KANON_UMBRAL. */
  async leerValor(clave: string): Promise<string | null> {
    const ahora = Date.now();
    const c = cacheInterna.get(clave);
    if (c && c.vence > ahora) return c.valor;
    const { data, error } = await supabaseAdmin.from('configuracion_sistema').select('valor').eq('clave', clave).maybeSingle();
    if (error) throw AppError.interno(`No fue posible leer la configuracion ${clave}: ${error.message}`);
    const valor = (data?.valor as string | null | undefined) ?? null;
    cacheInterna.set(clave, { valor, vence: ahora + TTL_CONFIG_MS });
    return valor;
  },

  async leerEntero(clave: string, defecto: number): Promise<number> {
    const v = await this.leerValor(clave);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : defecto;
  },

  __limpiarCacheParaPruebas(): void {
    cacheInterna.clear();
  },
};
