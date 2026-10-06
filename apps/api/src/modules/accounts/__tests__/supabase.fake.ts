import { randomUUID } from 'node:crypto';

/**
 * Supabase simulado en memoria para las pruebas del modulo accounts.
 * Implementa el subconjunto del query builder que usa el servicio
 * (select/insert/update/upsert/delete + eq/neq/in/is/not/or/ilike/order/range/limit
 * + maybeSingle/single + count/head) y `auth` (getUser, admin.*).
 * Las vistas `funcionario_cuenta` y `beneficiario_cuenta` se calculan al vuelo.
 */
type Fila = Record<string, unknown>;
type Filtro = (fila: Fila) => boolean;

export interface UsuarioAuthFake {
  id: string;
  email: string;
  rol: 'ADMINISTRADOR' | 'FUNCIONARIO' | 'BENEFICIARIO';
  last_sign_in_at?: string | null;
}

export function crearSupabaseFake() {
  const tablas = new Map<string, Fila[]>();
  const tokens = new Map<string, UsuarioAuthFake>();
  const authUsers = new Map<string, UsuarioAuthFake & { banned?: boolean; app_metadata: Record<string, unknown> }>();
  const llamadasAuth: Array<{ metodo: string; args: unknown[] }> = [];

  const TABLAS = [
    'usuario', 'funcionario', 'beneficiario', 'acudiente', 'consentimiento_datos', 'configuracion_sistema',
    'asignacion_funcionario', 'postulacion', 'convocatoria', 'solicitud_habeas_data', 'auditoria_evento',
  ];
  for (const t of TABLAS) tablas.set(t, []);

  function tabla(nombre: string): Fila[] {
    const t = tablas.get(nombre);
    if (!t) throw Object.assign(new Error(`relation "${nombre}" does not exist`), { code: '42P01' });
    return t;
  }

  function vista(nombre: string): Fila[] | null {
    if (nombre === 'funcionario_cuenta') {
      return tabla('funcionario').map((f) => {
        const u = tabla('usuario').find((x) => x.id === f.usuario_id) ?? {};
        return { ...f, email: u.email, activo: u.activo, ultimo_login: u.ultimo_login ?? null, invitacion_pendiente: !u.ultimo_login };
      });
    }
    if (nombre === 'beneficiario_cuenta') {
      return tabla('beneficiario').map((b) => {
        const u = tabla('usuario').find((x) => x.id === b.usuario_id) ?? {};
        return { ...b, email: u.email, activo: u.activo, ultimo_login: u.ultimo_login ?? null };
      });
    }
    return null;
  }

  class Builder implements PromiseLike<{ data: unknown; error: unknown; count: number | null }> {
    filtros: Filtro[] = [];
    op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    payload: Fila | Fila[] | null = null;
    onConflict: string | null = null;
    conCount = false;
    head = false;
    rango: [number, number] | null = null;
    limite: number | null = null;
    modo: 'lista' | 'single' | 'maybeSingle' = 'lista';
    devolver = false;

    constructor(readonly nombre: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (this.op !== 'select') this.devolver = true;
      if (opts?.count) this.conCount = true;
      if (opts?.head) this.head = true;
      return this;
    }
    insert(p: Fila | Fila[]) { this.op = 'insert'; this.payload = p; return this; }
    update(p: Fila) { this.op = 'update'; this.payload = p; return this; }
    upsert(p: Fila, o?: { onConflict?: string }) { this.op = 'upsert'; this.payload = p; this.onConflict = o?.onConflict ?? 'id'; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c: string, v: unknown) { this.filtros.push((f) => f[c] === v); return this; }
    neq(c: string, v: unknown) { this.filtros.push((f) => f[c] !== v); return this; }
    in(c: string, vs: unknown[]) { this.filtros.push((f) => vs.includes(f[c])); return this; }
    is(c: string, v: unknown) { this.filtros.push((f) => (v === null ? f[c] === null || f[c] === undefined : f[c] === v)); return this; }
    not(c: string, op: string, v: unknown) {
      if (op === 'is' && v === null) this.filtros.push((f) => f[c] !== null && f[c] !== undefined);
      return this;
    }
    ilike(c: string, p: string) {
      const re = new RegExp(`^${p.replace(/%/g, '.*')}$`, 'i');
      this.filtros.push((f) => typeof f[c] === 'string' && re.test(f[c] as string));
      return this;
    }
    or(_expr: string) { return this; }
    order() { return this; }
    range(a: number, b: number) { this.rango = [a, b]; return this; }
    limit(n: number) { this.limite = n; return this; }
    single() { this.modo = 'single'; return this; }
    maybeSingle() { this.modo = 'maybeSingle'; return this; }

    ejecutar(): { data: unknown; error: unknown; count: number | null } {
      try {
        const v = vista(this.nombre);
        const filas = v ?? tabla(this.nombre);
        const pasa = (f: Fila) => this.filtros.every((fn) => fn(f));
        let resultado: Fila[] = [];
        if (this.op === 'select') {
          resultado = filas.filter(pasa);
        } else if (this.op === 'insert') {
          const lista = Array.isArray(this.payload) ? this.payload : [this.payload as Fila];
          for (const p of lista) {
            const fila: Fila = { id: randomUUID(), creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(), creada_en: new Date().toISOString(), aceptado_en: new Date().toISOString(), ...p };
            if (this.nombre === 'solicitud_habeas_data' && !fila.estado) fila.estado = 'RADICADA';
            if (this.nombre === 'beneficiario') {
              if (filas.some((x) => x.numero_documento && x.numero_documento === fila.numero_documento)) {
                return { data: null, error: { message: 'duplicate key', code: '23505' }, count: null };
              }
              fila.es_menor ??= false; fila.perfil_completo ??= false; fila.anonimizado ??= false;
            }
            filas.push(fila);
            resultado.push(fila);
          }
        } else if (this.op === 'upsert') {
          const p = this.payload as Fila;
          const clave = this.onConflict as string;
          const existente = filas.find((x) => x[clave] === p[clave]);
          if (existente) {
            Object.assign(existente, p, { actualizado_en: new Date().toISOString() });
            resultado = [existente];
          } else {
            const fila = { id: randomUUID(), creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(), es_menor: false, perfil_completo: false, anonimizado: false, ...p };
            filas.push(fila);
            resultado = [fila];
          }
        } else if (this.op === 'update') {
          for (const f of filas) if (pasa(f)) { Object.assign(f, this.payload); resultado.push(f); }
        } else if (this.op === 'delete') {
          const quedan = filas.filter((f) => !pasa(f));
          resultado = filas.filter(pasa);
          filas.length = 0;
          filas.push(...quedan);
        }
        const total = resultado.length;
        // Como PostgREST: se devuelven copias, nunca referencias al almacenamiento.
        resultado = resultado.map((f) => ({ ...f }));
        if (this.rango) resultado = resultado.slice(this.rango[0], this.rango[1] + 1);
        if (this.limite !== null) resultado = resultado.slice(0, this.limite);
        if (this.head) return { data: null, error: null, count: total };
        if (this.modo === 'single') {
          if (resultado.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count: null };
          return { data: resultado[0], error: null, count: null };
        }
        if (this.modo === 'maybeSingle') return { data: resultado[0] ?? null, error: null, count: null };
        return { data: resultado, error: null, count: this.conCount ? total : null };
      } catch (e) {
        const err = e as Error & { code?: string };
        return { data: null, error: { message: err.message, code: err.code ?? 'ERROR' }, count: null };
      }
    }

    then<R1 = unknown, R2 = never>(
      onfulfilled?: ((v: { data: unknown; error: unknown; count: number | null }) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): PromiseLike<R1 | R2> {
      return Promise.resolve(this.ejecutar()).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from: (nombre: string) => new Builder(nombre),
    auth: {
      getUser: async (token: string) => {
        const u = tokens.get(token);
        if (!u) return { data: { user: null }, error: { message: 'invalid token' } };
        const au = authUsers.get(u.id);
        if (au?.banned) return { data: { user: null }, error: { message: 'banned' } };
        return { data: { user: { id: u.id, email: u.email, app_metadata: { rol: u.rol } } }, error: null };
      },
      admin: {
        updateUserById: async (id: string, attrs: Record<string, unknown>) => {
          llamadasAuth.push({ metodo: 'updateUserById', args: [id, attrs] });
          const au = authUsers.get(id);
          if (!au) return { data: { user: null }, error: { message: 'User not found' } };
          if (attrs.app_metadata) au.app_metadata = { ...au.app_metadata, ...(attrs.app_metadata as Record<string, unknown>) };
          if (attrs.ban_duration) au.banned = attrs.ban_duration !== 'none';
          if (typeof attrs.email === 'string') au.email = attrs.email;
          return { data: { user: { id, email: au.email, app_metadata: au.app_metadata } }, error: null };
        },
        inviteUserByEmail: async (email: string, opts: unknown) => {
          llamadasAuth.push({ metodo: 'inviteUserByEmail', args: [email, opts] });
          const existente = [...authUsers.values()].find((u) => u.email === email);
          if (existente) {
            if (existente.last_sign_in_at) return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } };
            return { data: { user: { id: existente.id, email } }, error: null };
          }
          const id = randomUUID();
          authUsers.set(id, { id, email, rol: 'BENEFICIARIO', app_metadata: {}, last_sign_in_at: null });
          // Simula el trigger on_auth_user_created
          tabla('usuario').push({ id, email, rol: 'BENEFICIARIO', activo: true, forzar_cambio_clave: false, ultimo_login: null, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() });
          return { data: { user: { id, email } }, error: null };
        },
        getUserById: async (id: string) => {
          const au = authUsers.get(id);
          if (!au) return { data: { user: null }, error: { message: 'User not found' } };
          return { data: { user: { id, email: au.email, last_sign_in_at: au.last_sign_in_at ?? null, app_metadata: au.app_metadata } }, error: null };
        },
      },
    },
  };

  /** Crea usuario autenticable (auth + public.usuario) y devuelve su token. */
  function crearUsuario(u: Omit<UsuarioAuthFake, 'id'> & { id?: string; activo?: boolean }): { id: string; token: string } {
    const id = u.id ?? randomUUID();
    const token = `tok-${id}`;
    tokens.set(token, { id, email: u.email, rol: u.rol, last_sign_in_at: u.last_sign_in_at ?? null });
    authUsers.set(id, { id, email: u.email, rol: u.rol, app_metadata: { rol: u.rol }, last_sign_in_at: u.last_sign_in_at ?? null });
    tabla('usuario').push({ id, email: u.email, rol: u.rol, activo: u.activo ?? true, forzar_cambio_clave: false, ultimo_login: u.last_sign_in_at ?? null, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() });
    return { id, token };
  }

  function reiniciar() {
    for (const t of TABLAS) tablas.set(t, []);
    tokens.clear();
    authUsers.clear();
    llamadasAuth.length = 0;
    tabla('configuracion_sistema').push({ id: randomUUID(), clave: 'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE', valor: '1' });
  }
  reiniciar();

  return { client, tabla, crearUsuario, reiniciar, llamadasAuth };
}

export type SupabaseFake = ReturnType<typeof crearSupabaseFake>;
