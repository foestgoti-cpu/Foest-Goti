/**
 * Cliente Supabase simulado para las pruebas del modulo admin_dashboard.
 * Cada tabla y cada RPC se resuelven con un manejador que recibe la operacion
 * acumulada (filtros, cuerpo) y devuelve `{ data, error, count }`.
 */
export interface Operacion {
  tabla: string;
  tipo: 'select' | 'insert' | 'update' | 'delete';
  filtros: Array<{ op: string; columna: string; valor: unknown }>;
  cuerpo?: unknown;
  single?: boolean;
  rango?: [number, number];
}

export type Resultado = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
export type ManejadorTabla = (op: Operacion) => Resultado;
export type ManejadorRpc = (args: Record<string, unknown>) => Resultado;

export interface UsuarioFalso {
  id: string;
  email: string;
  rol: 'ADMINISTRADOR' | 'FUNCIONARIO' | 'BENEFICIARIO';
  activo?: boolean;
}

export class FakeSupabase {
  tablas = new Map<string, ManejadorTabla>();
  rpcs = new Map<string, ManejadorRpc>();
  usuarios = new Map<string, UsuarioFalso>(); // token -> usuario
  operaciones: Operacion[] = [];
  llamadasRpc: Array<{ fn: string; args: Record<string, unknown> }> = [];

  auth = {
    getUser: async (token: string) => {
      const u = this.usuarios.get(token);
      if (!u) return { data: { user: null }, error: { message: 'invalido' } };
      return { data: { user: { id: u.id, email: u.email, app_metadata: { rol: u.rol } } }, error: null };
    },
  };

  constructor() {
    // Perfil `usuario` para authenticate(): se deriva de los usuarios registrados.
    this.tablas.set('usuario', (op) => {
      const id = op.filtros.find((f) => f.columna === 'id')?.valor;
      const u = [...this.usuarios.values()].find((x) => x.id === id);
      if (!u) return { data: null, error: null };
      return { data: { id: u.id, email: u.email, rol: u.rol, activo: u.activo ?? true }, error: null };
    });
    this.tablas.set('auditoria_evento', (op) => (op.tipo === 'insert' ? { data: { id: 'evt-1' }, error: null } : { data: [], error: null, count: 0 }));
  }

  from(tabla: string) {
    const self = this;
    const op: Operacion = { tabla, tipo: 'select', filtros: [] };
    const builder: Record<string, unknown> = {};
    const encadenar = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => {
      fn(...a);
      return builder;
    };
    builder.select = encadenar(() => {
      if (op.tipo === 'select') op.tipo = 'select';
    });
    builder.insert = encadenar((cuerpo) => {
      op.tipo = 'insert';
      op.cuerpo = cuerpo;
    });
    builder.update = encadenar((cuerpo) => {
      op.tipo = 'update';
      op.cuerpo = cuerpo;
    });
    builder.delete = encadenar(() => {
      op.tipo = 'delete';
    });
    for (const f of ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'ilike']) {
      builder[f] = encadenar((columna, valor) => op.filtros.push({ op: f, columna: columna as string, valor }));
    }
    builder.order = encadenar(() => undefined);
    builder.limit = encadenar(() => undefined);
    builder.range = encadenar((a, b) => {
      op.rango = [a as number, b as number];
    });
    builder.maybeSingle = encadenar(() => {
      op.single = true;
    });
    builder.single = encadenar(() => {
      op.single = true;
    });
    builder.then = (resolve: (r: Resultado) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        self.operaciones.push(op);
        const manejador = self.tablas.get(tabla);
        const r: Resultado = manejador ? manejador(op) : { data: op.single ? null : [], error: null, count: 0 };
        return Promise.resolve(resolve(r));
      } catch (e) {
        return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
      }
    };
    return builder;
  }

  async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Resultado> {
    this.llamadasRpc.push({ fn, args });
    const m = this.rpcs.get(fn);
    if (!m) return { data: null, error: { message: `rpc ${fn} no simulada` } };
    return m(args);
  }

  reiniciarRegistro(): void {
    this.operaciones = [];
    this.llamadasRpc = [];
  }
}
