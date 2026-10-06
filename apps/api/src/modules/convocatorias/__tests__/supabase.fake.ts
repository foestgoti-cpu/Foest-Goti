/**
 * Cliente de Supabase simulado para pruebas del modulo (sin credenciales).
 * `from(tabla)` devuelve un constructor encadenable y "thenable": al hacer `await`
 * se invoca el manejador registrado para esa tabla con la consulta acumulada.
 */
export type OpFake = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export interface ConsultaFake {
  tabla: string;
  op: OpFake;
  payload?: unknown;
  columnas?: string;
  filtros: Array<{ metodo: string; args: unknown[] }>;
  single: boolean;
}

export interface RespuestaFake {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export type ManejadorFake = (q: ConsultaFake) => RespuestaFake | Promise<RespuestaFake>;

export interface ClienteFake {
  from: (tabla: string) => unknown;
  auth: { getUser: (token: string) => Promise<unknown> };
  manejadores: Record<string, ManejadorFake>;
  consultas: ConsultaFake[];
  reiniciar: () => void;
}

export function crearClienteFake(): ClienteFake {
  const cliente: ClienteFake = {
    manejadores: {},
    consultas: [],
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no' } }) },
    reiniciar() {
      cliente.manejadores = {};
      cliente.consultas = [];
    },
    from(tabla: string) {
      const q: ConsultaFake = { tabla, op: 'select', filtros: [], single: false };
      const b: Record<string, unknown> = {};
      const encadenar = (metodo: string) =>
        (...args: unknown[]) => {
          q.filtros.push({ metodo, args });
          return b;
        };
      b.select = (columnas?: string) => {
        if (q.op === 'select') q.columnas = columnas;
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

/** Filtro `eq` de una consulta (util para manejadores). */
export function valorEq(q: ConsultaFake, columna: string): unknown {
  return q.filtros.find((f) => f.metodo === 'eq' && f.args[0] === columna)?.args[1];
}
