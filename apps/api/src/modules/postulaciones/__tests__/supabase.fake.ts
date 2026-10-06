/**
 * Cliente de Supabase simulado para las pruebas del modulo (sin credenciales).
 * `from(tabla)` devuelve un constructor encadenable y "thenable"; `rpc(fn, args)`
 * invoca el manejador registrado en `rpcs[fn]`.
 */
export type OpFake = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export interface ConsultaFake {
  tabla: string;
  op: OpFake;
  payload?: unknown;
  columnas?: string;
  opciones?: unknown;
  filtros: Array<{ metodo: string; args: unknown[] }>;
  single: boolean;
}

export interface RespuestaFake {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export type ManejadorFake = (q: ConsultaFake) => RespuestaFake | Promise<RespuestaFake>;
export type RpcFake = (args: Record<string, unknown>) => RespuestaFake | Promise<RespuestaFake>;

export interface ClienteFake {
  from: (tabla: string) => unknown;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RespuestaFake>;
  auth: { getUser: (token: string) => Promise<unknown> };
  manejadores: Record<string, ManejadorFake>;
  rpcs: Record<string, RpcFake>;
  consultas: ConsultaFake[];
  llamadasRpc: Array<{ fn: string; args: Record<string, unknown> }>;
  reiniciar: () => void;
}

export function crearClienteFake(): ClienteFake {
  const cliente: ClienteFake = {
    manejadores: {},
    rpcs: {},
    consultas: [],
    llamadasRpc: [],
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no' } }) },
    reiniciar() {
      cliente.manejadores = {};
      cliente.rpcs = {};
      cliente.consultas = [];
      cliente.llamadasRpc = [];
    },
    async rpc(fn, args) {
      cliente.llamadasRpc.push({ fn, args });
      const m = cliente.rpcs[fn];
      if (!m) return { data: null, error: { message: `rpc ${fn} sin manejador` } };
      const r = await m(args);
      return { data: r.data ?? null, error: r.error ?? null };
    },
    from(tabla: string) {
      const q: ConsultaFake = { tabla, op: 'select', filtros: [], single: false };
      const b: Record<string, unknown> = {};
      const encadenar = (metodo: string) =>
        (...args: unknown[]) => {
          q.filtros.push({ metodo, args });
          return b;
        };
      b.select = (columnas?: string, opciones?: unknown) => {
        if (q.op === 'select') {
          q.columnas = columnas;
          q.opciones = opciones;
        }
        return b;
      };
      b.insert = (payload: unknown) => {
        q.op = 'insert';
        q.payload = payload;
        return b;
      };
      b.update = (payload: unknown) => {
        q.op = 'update';
        q.payload = payload;
        return b;
      };
      b.upsert = (payload: unknown) => {
        q.op = 'upsert';
        q.payload = payload;
        return b;
      };
      b.delete = () => {
        q.op = 'delete';
        return b;
      };
      for (const m of ['eq', 'neq', 'in', 'is', 'lt', 'lte', 'gt', 'gte', 'not', 'or', 'order', 'range', 'limit', 'ilike', 'like']) {
        b[m] = encadenar(m);
      }
      b.single = () => {
        q.single = true;
        return b;
      };
      b.maybeSingle = () => {
        q.single = true;
        return b;
      };
      b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        cliente.consultas.push(q);
        const manejador = cliente.manejadores[tabla];
        const respuesta: Promise<RespuestaFake> = manejador
          ? Promise.resolve(manejador(q))
          : Promise.resolve({ data: q.single ? null : [], error: null, count: 0 });
        return respuesta
          .then((r) => ({ data: r.data === undefined ? (q.single ? null : []) : r.data, error: r.error ?? null, count: r.count ?? null }))
          .then(resolve, reject);
      };
      return b;
    },
  };
  return cliente;
}

/** Valor del filtro `eq` de una columna. */
export function valorEq(q: ConsultaFake, columna: string): unknown {
  return q.filtros.find((f) => f.metodo === 'eq' && f.args[0] === columna)?.args[1];
}
