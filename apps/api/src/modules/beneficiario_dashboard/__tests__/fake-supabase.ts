/**
 * Cliente Supabase simulado en memoria para las pruebas del modulo.
 * Soporta la parte de la API de supabase-js que usa el servicio:
 *   from().select(cols, { count, head }).eq/neq/in/is/gt/gte/lt/lte().order().range().limit()
 *   .maybeSingle()/.single() y update().eq().select() ; awaitable (thenable).
 * Las tablas ausentes responden con el error `42P01` (relacion inexistente).
 */
import type { Rol } from '@foest/shared';

export type Fila = Record<string, unknown>;
export type Tablas = Record<string, Fila[]>;

interface Filtro {
  tipo: 'eq' | 'neq' | 'in' | 'is' | 'gt' | 'gte' | 'lt' | 'lte';
  columna: string;
  valor: unknown;
}

function comparar(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function pasa(fila: Fila, f: Filtro): boolean {
  const v = fila[f.columna];
  switch (f.tipo) {
    case 'eq':
      return v === f.valor;
    case 'neq':
      return v !== f.valor;
    case 'in':
      return (f.valor as unknown[]).includes(v);
    case 'is':
      return v === f.valor;
    case 'gt':
      return comparar(v, f.valor) > 0;
    case 'gte':
      return comparar(v, f.valor) >= 0;
    case 'lt':
      return comparar(v, f.valor) < 0;
    case 'lte':
      return comparar(v, f.valor) <= 0;
    default:
      return true;
  }
}

class ConsultaFalsa implements PromiseLike<{ data: unknown; error: unknown; count: number | null }> {
  private filtros: Filtro[] = [];
  private orden: Array<{ columna: string; ascending: boolean }> = [];
  private rango: { desde: number; hasta: number } | null = null;
  private limite: number | null = null;
  private modo: 'select' | 'update' = 'select';
  private cambios: Fila | null = null;
  private contar = false;
  private head = false;
  private unico: 'single' | 'maybeSingle' | null = null;
  private seleccionTrasUpdate = false;

  constructor(
    private readonly tablas: Tablas,
    private readonly tabla: string,
    private readonly registrar: (tabla: string) => void,
  ) {}

  select(_cols?: string, opciones?: { count?: string; head?: boolean }) {
    if (this.modo === 'update') this.seleccionTrasUpdate = true;
    this.contar = Boolean(opciones?.count);
    this.head = Boolean(opciones?.head);
    return this;
  }
  update(cambios: Fila) {
    this.modo = 'update';
    this.cambios = cambios;
    return this;
  }
  eq(c: string, v: unknown) {
    this.filtros.push({ tipo: 'eq', columna: c, valor: v });
    return this;
  }
  neq(c: string, v: unknown) {
    this.filtros.push({ tipo: 'neq', columna: c, valor: v });
    return this;
  }
  in(c: string, v: unknown[]) {
    this.filtros.push({ tipo: 'in', columna: c, valor: v });
    return this;
  }
  is(c: string, v: unknown) {
    this.filtros.push({ tipo: 'is', columna: c, valor: v });
    return this;
  }
  gt(c: string, v: unknown) {
    this.filtros.push({ tipo: 'gt', columna: c, valor: v });
    return this;
  }
  gte(c: string, v: unknown) {
    this.filtros.push({ tipo: 'gte', columna: c, valor: v });
    return this;
  }
  lt(c: string, v: unknown) {
    this.filtros.push({ tipo: 'lt', columna: c, valor: v });
    return this;
  }
  lte(c: string, v: unknown) {
    this.filtros.push({ tipo: 'lte', columna: c, valor: v });
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) {
    this.orden.push({ columna: c, ascending: o?.ascending ?? true });
    return this;
  }
  range(desde: number, hasta: number) {
    this.rango = { desde, hasta };
    return this;
  }
  limit(n: number) {
    this.limite = n;
    return this;
  }
  single() {
    this.unico = 'single';
    return this;
  }
  maybeSingle() {
    this.unico = 'maybeSingle';
    return this;
  }

  private ejecutar(): { data: unknown; error: unknown; count: number | null } {
    this.registrar(this.tabla);
    const filas = this.tablas[this.tabla];
    if (!filas) {
      return { data: null, error: { code: '42P01', message: `relation "public.${this.tabla}" does not exist` }, count: null };
    }
    let resultado = filas.filter((f) => this.filtros.every((fl) => pasa(f, fl)));
    if (this.modo === 'update' && this.cambios) {
      for (const f of resultado) Object.assign(f, this.cambios);
      if (!this.seleccionTrasUpdate) return { data: null, error: null, count: null };
    }
    for (const o of [...this.orden].reverse()) {
      resultado = [...resultado].sort((a, b) => (o.ascending ? 1 : -1) * comparar(a[o.columna], b[o.columna]));
    }
    const total = resultado.length;
    if (this.rango) resultado = resultado.slice(this.rango.desde, this.rango.hasta + 1);
    if (this.limite !== null) resultado = resultado.slice(0, this.limite);
    if (this.head) return { data: null, error: null, count: this.contar ? total : null };
    if (this.unico === 'single') {
      if (resultado.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, count: null };
      return { data: resultado[0], error: null, count: null };
    }
    if (this.unico === 'maybeSingle') return { data: resultado[0] ?? null, error: null, count: null };
    return { data: resultado.map((f) => ({ ...f })), error: null, count: this.contar ? total : null };
  }

  then<TResult1 = { data: unknown; error: unknown; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.ejecutar()).then(onfulfilled, onrejected);
  }
}

export interface UsuarioFalso {
  id: string;
  email: string;
  rol: Rol;
  activo?: boolean;
}

export interface FakeSupabase {
  tablas: Tablas;
  tablasConsultadas: string[];
  /** Cliente que imita `supabaseAsUser(token)`: sin RLS (las pruebas verifican la barrera explicita del servicio). */
  clienteUsuario: () => { from: (tabla: string) => ConsultaFalsa };
  /** Cliente que imita `supabaseAdmin` (incluye `auth.getUser`). */
  clienteAdmin: { from: (tabla: string) => ConsultaFalsa; auth: { getUser: (token: string) => Promise<unknown> } };
  usuarios: Record<string, UsuarioFalso>;
}

export function crearFakeSupabase(tablas: Tablas, usuarios: Record<string, UsuarioFalso>): FakeSupabase {
  const tablasConsultadas: string[] = [];
  const registrar = (t: string) => tablasConsultadas.push(t);
  const from = (tabla: string) => new ConsultaFalsa(tablas, tabla, registrar);
  // La tabla `usuario` la lee authenticate() con el cliente admin.
  tablas.usuario = Object.values(usuarios).map((u) => ({ id: u.id, email: u.email, rol: u.rol, activo: u.activo ?? true }));
  return {
    tablas,
    tablasConsultadas,
    usuarios,
    clienteUsuario: () => ({ from }),
    clienteAdmin: {
      from,
      auth: {
        getUser: async (token: string) => {
          const u = usuarios[token];
          if (!u) return { data: { user: null }, error: { message: 'invalid token' } };
          return { data: { user: { id: u.id, email: u.email, app_metadata: { rol: u.rol } } }, error: null };
        },
      },
    },
  };
}
