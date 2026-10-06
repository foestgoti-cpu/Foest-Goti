import request from 'supertest';

/**
 * Pruebas del modulo auth con Supabase simulado en memoria:
 *  - `supabaseAdmin` (service role): tablas usuario, beneficiario, consentimiento_datos,
 *    intento_login, auditoria_evento, configuracion_sistema, funcionario + auth.admin.
 *  - cliente anon (`getSupabaseAnon`): signInWithPassword, signUp, refreshSession, etc.
 */

type Fila = Record<string, unknown>;
interface UsuarioAuth {
  id: string;
  email: string;
  password: string;
  rol: string;
  confirmado: boolean;
}

const db = {
  configuracion_sistema: [] as Fila[],
  usuario: [] as Fila[],
  beneficiario: [] as Fila[],
  funcionario: [] as Fila[],
  consentimiento_datos: [] as Fila[],
  intento_login: [] as Fila[],
  auditoria_evento: [] as Fila[],
};
type Tabla = keyof typeof db;
const usuariosAuth = new Map<string, UsuarioAuth>();
let secuencia = 0;

function reiniciar() {
  for (const k of Object.keys(db) as Tabla[]) db[k] = [];
  usuariosAuth.clear();
  secuencia = 0;
  db.configuracion_sistema = [
    { clave: 'CONSENTIMIENTO_TEXTO_VERSION_VIGENTE', valor: '3' },
    { clave: 'CONSENTIMIENTO_TEXTO', valor: 'Texto de consentimiento de prueba' },
  ];
}

function crearUsuario(email: string, password: string, rol: string, extra: Partial<Fila> = {}) {
  const id = `00000000-0000-4000-8000-${String(++secuencia).padStart(12, '0')}`;
  usuariosAuth.set(id, { id, email, password, rol, confirmado: true });
  db.usuario.push({ id, email, rol, activo: true, forzar_cambio_clave: false, ultimo_login: null, ...extra });
  return id;
}

function sesionDe(u: UsuarioAuth) {
  return {
    access_token: `tok-${u.id}`,
    refresh_token: `ref-${u.id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: u.id, email: u.email, app_metadata: { rol: u.rol }, identities: [{ id: 'x' }] },
  };
}

class Consulta {
  private filtros: Array<(f: Fila) => boolean> = [];
  private op: 'select' | 'insert' | 'update' = 'select';
  private payload: Fila | Fila[] | null = null;
  private conteo = false;
  private head = false;
  private unico: 'single' | 'maybe' | null = null;

  constructor(private readonly tabla: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    this.conteo = Boolean(opts?.count);
    this.head = Boolean(opts?.head);
    return this;
  }
  insert(p: Fila | Fila[]) {
    this.op = 'insert';
    this.payload = p;
    return this;
  }
  update(p: Fila) {
    this.op = 'update';
    this.payload = p;
    return this;
  }
  eq(k: string, v: unknown) {
    this.filtros.push((f) => f[k] === v);
    return this;
  }
  gte(k: string, v: unknown) {
    this.filtros.push((f) => String(f[k]) >= String(v));
    return this;
  }
  in(k: string, vs: unknown[]) {
    this.filtros.push((f) => vs.includes(f[k]));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  range() {
    return this;
  }
  maybeSingle() {
    this.unico = 'maybe';
    return this;
  }
  single() {
    this.unico = 'single';
    return this;
  }

  private ejecutar(): { data: unknown; error: null | { message: string; code?: string }; count: number | null } {
    const tabla = (db[this.tabla as Tabla] ??= []);
    if (this.op === 'insert') {
      const filas = Array.isArray(this.payload) ? this.payload : [this.payload as Fila];
      const insertadas: Fila[] = filas.map((f) => ({
        id: `11111111-1111-4111-8111-${String(++secuencia).padStart(12, '0')}`,
        creado_en: new Date().toISOString(),
        ...f,
      }));
      if (this.tabla === 'beneficiario') {
        const doc = insertadas[0]?.numero_documento;
        if (doc && tabla.some((t) => t.numero_documento === doc)) {
          return { data: null, error: { message: 'duplicate key', code: '23505' }, count: null };
        }
      }
      tabla.push(...insertadas);
      return { data: this.unico ? insertadas[0] : insertadas, error: null, count: null };
    }
    const filtradas = tabla.filter((f) => this.filtros.every((fn) => fn(f)));
    if (this.op === 'update') {
      for (const f of filtradas) Object.assign(f, this.payload);
      return { data: this.unico ? (filtradas[0] ?? null) : filtradas, error: null, count: null };
    }
    if (this.conteo) return { data: this.head ? null : filtradas, error: null, count: filtradas.length };
    if (this.unico === 'single') {
      return filtradas[0]
        ? { data: filtradas[0], error: null, count: null }
        : { data: null, error: { message: 'no rows' }, count: null };
    }
    if (this.unico === 'maybe') return { data: filtradas[0] ?? null, error: null, count: null };
    return { data: filtradas, error: null, count: null };
  }

  then<T>(onOk: (v: ReturnType<Consulta['ejecutar']>) => T, onErr?: (e: unknown) => T) {
    return Promise.resolve(this.ejecutar()).then(onOk, onErr);
  }
}

const mockAdmin = {
  from: (tabla: string) => new Consulta(tabla),
  auth: {
    getUser: async (token: string) => {
      const id = token.startsWith('tok-') ? token.slice(4) : '';
      const u = usuariosAuth.get(id);
      if (!u) return { data: { user: null }, error: { message: 'invalid' } };
      return { data: { user: { id: u.id, email: u.email, app_metadata: { rol: u.rol } } }, error: null };
    },
    admin: {
      updateUserById: async (id: string, attrs: { password?: string; app_metadata?: { rol?: string } }) => {
        const u = usuariosAuth.get(id);
        if (!u) return { data: { user: null }, error: { message: 'not found' } };
        if (attrs.password) u.password = attrs.password;
        if (attrs.app_metadata?.rol) {
          u.rol = attrs.app_metadata.rol;
          const fila = db.usuario.find((x) => x.id === id);
          if (fila) fila.rol = u.rol;
        }
        return { data: { user: { id } }, error: null };
      },
      signOut: async () => ({ data: null, error: null }),
      deleteUser: async (id: string) => {
        usuariosAuth.delete(id);
        db.usuario = db.usuario.filter((x) => x.id !== id);
        return { data: null, error: null };
      },
    },
  },
};

const mockAnon = {
  auth: {
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const u = [...usuariosAuth.values()].find((x) => x.email === email);
      if (!u || u.password !== password) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
      if (!u.confirmado) return { data: { session: null, user: null }, error: { message: 'Email not confirmed', code: 'email_not_confirmed' } };
      const s = sesionDe(u);
      return { data: { session: s, user: s.user }, error: null };
    },
    signUp: async ({ email, password }: { email: string; password: string }) => {
      const existente = [...usuariosAuth.values()].find((x) => x.email === email);
      if (existente) return { data: { user: { id: existente.id, identities: [] }, session: null }, error: null };
      const id = crearUsuario(email, password, 'BENEFICIARIO');
      return { data: { user: { id, email, identities: [{ id: 'x' }] }, session: null }, error: null };
    },
    refreshSession: async ({ refresh_token }: { refresh_token: string }) => {
      const id = refresh_token.startsWith('ref-') ? refresh_token.slice(4) : '';
      const u = usuariosAuth.get(id);
      if (!u) return { data: { session: null }, error: { message: 'invalid' } };
      return { data: { session: sesionDe(u) }, error: null };
    },
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    resend: async () => ({ data: {}, error: null }),
    signOut: async () => ({ error: null }),
  },
};

jest.mock('../../../config/env', () => ({
  ...jest.requireActual('../../../config/env'),
  hasSupabaseCredentials: () => true,
}));
jest.mock('../../../shared/supabase', () => ({
  supabaseAdmin: mockAdmin,
  getSupabaseAdmin: () => mockAdmin,
  supabaseAsUser: () => mockAdmin,
  __setSupabaseAdminForTests: () => undefined,
}));
jest.mock('../auth.clients', () => ({
  getSupabaseAnon: () => mockAnon,
  urlWeb: (r: string) => `http://localhost:5173${r}`,
  __setSupabaseAnonForTests: () => undefined,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require('../../../app') as typeof import('../../../app');

const PASSWORD = 'Clave.Segura1';
const BASE = '/api/v1/auth';

describe('modulo auth', () => {
  const app = createApp();

  beforeEach(() => reiniciar());

  describe('GET /auth/consentimiento/vigente (publico)', () => {
    it('entrega version y texto vigentes sin token', async () => {
      const res = await request(app).get(`${BASE}/consentimiento/vigente`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ version: 3, texto: 'Texto de consentimiento de prueba' });
    });
  });

  describe('POST /auth/register', () => {
    const cuerpo = {
      email: 'nuevo@foest.test',
      password: PASSWORD,
      nombres: 'Ana',
      apellidos: 'Perez',
      fecha_nacimiento: '2000-05-10',
      aceptar_consentimiento: true,
      version_consentimiento: 3,
    };

    it('caso feliz: crea BENEFICIARIO, perfil y consentimiento con la version vigente, y audita', async () => {
      const res = await request(app).post(`${BASE}/register`).send(cuerpo);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ email: 'nuevo@foest.test', rol: 'BENEFICIARIO', requiere_verificacion: true });
      expect(db.usuario.find((u) => u.email === 'nuevo@foest.test')?.rol).toBe('BENEFICIARIO');
      expect(db.beneficiario).toHaveLength(1);
      expect(db.beneficiario[0]).toMatchObject({ nombres: 'Ana', es_menor: false });
      expect(db.consentimiento_datos).toHaveLength(1);
      expect(db.consentimiento_datos[0]).toMatchObject({ version_texto: 3, es_menor_al_aceptar: false });
      expect(db.auditoria_evento.some((e) => e.accion === 'CREAR' && e.entidad === 'USUARIO')).toBe(true);
    });

    it('sin consentimiento responde 422 CONSENTIMIENTO_REQUERIDO y no crea nada', async () => {
      const res = await request(app).post(`${BASE}/register`).send({ ...cuerpo, aceptar_consentimiento: false });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('CONSENTIMIENTO_REQUERIDO');
      expect(db.usuario).toHaveLength(0);
      expect(db.consentimiento_datos).toHaveLength(0);
    });

    it('contrasena que incumple la politica responde 422 con detalle', async () => {
      const res = await request(app).post(`${BASE}/register`).send({ ...cuerpo, password: 'debil' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('DATOS_INVALIDOS');
      expect(res.body.details.some((d: { path: string }) => d.path === 'password')).toBe(true);
    });

    it('correo ya registrado responde 409 EMAIL_EN_USO', async () => {
      crearUsuario('nuevo@foest.test', PASSWORD, 'BENEFICIARIO');
      const res = await request(app).post(`${BASE}/register`).send(cuerpo);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_EN_USO');
    });

    it('menor de edad sin acudiente responde 422; con acudiente guarda sus datos en el consentimiento', async () => {
      const hoy = new Date();
      const nacimiento = `${hoy.getUTCFullYear() - 16}-01-01`;
      const sin = await request(app).post(`${BASE}/register`).send({ ...cuerpo, fecha_nacimiento: nacimiento });
      expect(sin.status).toBe(422);
      expect(sin.body.code).toBe('ACUDIENTE_REQUERIDO');

      const con = await request(app)
        .post(`${BASE}/register`)
        .send({
          ...cuerpo,
          fecha_nacimiento: nacimiento,
          acudiente: { nombre: 'Luis Perez', tipo_documento: 'CC', numero_documento: '12345678', correo: 'luis@foest.test' },
        });
      expect(con.status).toBe(201);
      expect(db.consentimiento_datos[0]).toMatchObject({ es_menor_al_aceptar: true, acudiente_nombre: 'Luis Perez' });
    });
  });

  describe('POST /auth/login', () => {
    it('caso feliz: devuelve tokens y usuario con rol, registra intento y audita LOGIN', async () => {
      const id = crearUsuario('ben@foest.test', PASSWORD, 'BENEFICIARIO');
      const res = await request(app).post(`${BASE}/login`).send({ email: 'ben@foest.test', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.access_token).toBe(`tok-${id}`);
      expect(res.body.refresh_token).toBeDefined();
      expect(res.body.usuario).toMatchObject({ id, email: 'ben@foest.test', rol: 'BENEFICIARIO', forzar_cambio_clave: false });
      expect(db.intento_login).toHaveLength(1);
      expect(db.intento_login[0]).toMatchObject({ email: 'ben@foest.test', exitoso: true });
      expect(db.auditoria_evento.some((e) => e.accion === 'LOGIN' && e.actor_id === id)).toBe(true);
      expect(db.usuario[0]?.ultimo_login).toBeTruthy();
    });

    it('credenciales incorrectas: 401 generico y auditoria LOGIN_FALLIDO (sin la contrasena)', async () => {
      crearUsuario('ben@foest.test', PASSWORD, 'BENEFICIARIO');
      const res = await request(app).post(`${BASE}/login`).send({ email: 'ben@foest.test', password: 'Otra.Clave9' });
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'CREDENCIALES_INVALIDAS', message: 'Credenciales invalidas' });
      const evento = db.auditoria_evento.find((e) => e.accion === 'LOGIN_FALLIDO');
      expect(evento).toBeDefined();
      expect(JSON.stringify(evento)).not.toContain('Otra.Clave9');
      // correo inexistente: misma respuesta
      const res2 = await request(app).post(`${BASE}/login`).send({ email: 'nadie@foest.test', password: PASSWORD });
      expect(res2.status).toBe(401);
      expect(res2.body.code).toBe('CREDENCIALES_INVALIDAS');
    });

    it('usuario con activo=false responde 403 CUENTA_INACTIVA aunque las credenciales sean correctas', async () => {
      crearUsuario('inactivo@foest.test', PASSWORD, 'FUNCIONARIO', { activo: false });
      const res = await request(app).post(`${BASE}/login`).send({ email: 'inactivo@foest.test', password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CUENTA_INACTIVA');
    });

    it('correo no verificado responde 403 EMAIL_NO_VERIFICADO', async () => {
      const id = crearUsuario('pend@foest.test', PASSWORD, 'BENEFICIARIO');
      (usuariosAuth.get(id) as UsuarioAuth).confirmado = false;
      const res = await request(app).post(`${BASE}/login`).send({ email: 'pend@foest.test', password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NO_VERIFICADO');
    });

    it('5 fallos del mismo correo bloquean el correo (429) aunque cambie la IP', async () => {
      crearUsuario('ben@foest.test', PASSWORD, 'BENEFICIARIO');
      for (let i = 0; i < 5; i += 1) {
        const r = await request(app)
          .post(`${BASE}/login`)
          .set('X-Forwarded-For', `10.0.0.${i + 1}`)
          .send({ email: 'ben@foest.test', password: 'Mala.Clave1' });
        expect(r.status).toBe(401);
      }
      const bloqueado = await request(app)
        .post(`${BASE}/login`)
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'ben@foest.test', password: PASSWORD });
      expect(bloqueado.status).toBe(429);
      expect(bloqueado.body.code).toBe('CUENTA_BLOQUEADA_TEMPORAL');
      expect(bloqueado.headers['retry-after']).toBeDefined();
    });

    it('20 intentos desde la misma IP (correos distintos) responden 429 DEMASIADOS_INTENTOS', async () => {
      for (let i = 0; i < 20; i += 1) {
        const r = await request(app)
          .post(`${BASE}/login`)
          .set('X-Forwarded-For', '192.168.1.50')
          .send({ email: `u${i}@foest.test`, password: 'Mala.Clave1' });
        expect(r.status).toBe(401);
      }
      const res = await request(app)
        .post(`${BASE}/login`)
        .set('X-Forwarded-For', '192.168.1.50')
        .send({ email: 'u99@foest.test', password: 'Mala.Clave1' });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('DEMASIADOS_INTENTOS');
    });
  });

  describe('POST /auth/refresh', () => {
    it('refresh token invalido responde 401; valido devuelve nueva sesion', async () => {
      const id = crearUsuario('ben@foest.test', PASSWORD, 'BENEFICIARIO');
      const malo = await request(app).post(`${BASE}/refresh`).send({ refresh_token: 'ref-nadie' });
      expect(malo.status).toBe(401);
      const bueno = await request(app).post(`${BASE}/refresh`).send({ refresh_token: `ref-${id}` });
      expect(bueno.status).toBe(200);
      expect(bueno.body.access_token).toBe(`tok-${id}`);
    });
  });

  describe('rutas autenticadas', () => {
    it('GET /auth/me sin token responde 401', async () => {
      const res = await request(app).get(`${BASE}/me`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    it('GET /auth/me con cuenta inactiva responde 403 CUENTA_INACTIVA', async () => {
      const id = crearUsuario('inactivo@foest.test', PASSWORD, 'FUNCIONARIO', { activo: false });
      const res = await request(app).get(`${BASE}/me`).set('Authorization', `Bearer tok-${id}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CUENTA_INACTIVA');
    });

    it('GET /auth/me devuelve usuario, permisos del rol (servidor) y perfil basico', async () => {
      const id = crearUsuario('ben@foest.test', PASSWORD, 'BENEFICIARIO', { forzar_cambio_clave: true });
      db.beneficiario.push({ id: 'b1', usuario_id: id, nombres: 'Ana', apellidos: 'Perez', tipo_documento: null, numero_documento: null, es_menor: false, perfil_completo: false });
      const res = await request(app).get(`${BASE}/me`).set('Authorization', `Bearer tok-${id}`);
      expect(res.status).toBe(200);
      expect(res.body.usuario).toMatchObject({ id, rol: 'BENEFICIARIO' });
      expect(res.body.forzar_cambio_clave).toBe(true);
      expect(res.body.permisos).toContain('postulacion:crear');
      expect(res.body.permisos).not.toContain('evaluacion:dictaminar');
      expect(res.body.perfil).toMatchObject({ tipo: 'BENEFICIARIO', nombres: 'Ana' });
    });

    it('POST /auth/password/change exige la clave actual (422) y luego apaga forzar_cambio_clave', async () => {
      const id = crearUsuario('ben@foest.test', PASSWORD, 'BENEFICIARIO', { forzar_cambio_clave: true });
      const mal = await request(app)
        .post(`${BASE}/password/change`)
        .set('Authorization', `Bearer tok-${id}`)
        .send({ password_actual: 'Incorrecta.1', password_nueva: 'Nueva.Clave2' });
      expect(mal.status).toBe(422);
      expect(mal.body.code).toBe('CLAVE_ACTUAL_INCORRECTA');

      const ok = await request(app)
        .post(`${BASE}/password/change`)
        .set('Authorization', `Bearer tok-${id}`)
        .send({ password_actual: PASSWORD, password_nueva: 'Nueva.Clave2' });
      expect(ok.status).toBe(200);
      expect(ok.body.access_token).toBe(`tok-${id}`);
      expect(usuariosAuth.get(id)?.password).toBe('Nueva.Clave2');
      expect(db.usuario[0]?.forzar_cambio_clave).toBe(false);
      expect(db.auditoria_evento.some((e) => e.accion === 'CAMBIO_CLAVE' && e.actor_id === id)).toBe(true);
    });

    it('POST /auth/invitacion/aceptar define la contrasena, activa la cuenta y audita', async () => {
      const id = crearUsuario('func@foest.test', '', 'FUNCIONARIO');
      const res = await request(app)
        .post(`${BASE}/invitacion/aceptar`)
        .set('Authorization', `Bearer tok-${id}`)
        .send({ password: 'Clave.Func1' });
      expect(res.status).toBe(200);
      expect(res.body.usuario).toMatchObject({ id, rol: 'FUNCIONARIO', forzar_cambio_clave: false });
      expect(res.body.access_token).toBe(`tok-${id}`);
      expect(usuariosAuth.get(id)?.password).toBe('Clave.Func1');
      expect(db.auditoria_evento.some((e) => e.accion === 'INVITACION_ACEPTADA')).toBe(true);
    });

    it('POST /auth/logout responde 204 y audita LOGOUT', async () => {
      const id = crearUsuario('ben@foest.test', PASSWORD, 'BENEFICIARIO');
      const res = await request(app).post(`${BASE}/logout`).set('Authorization', `Bearer tok-${id}`);
      expect(res.status).toBe(204);
      expect(db.auditoria_evento.some((e) => e.accion === 'LOGOUT' && e.actor_id === id)).toBe(true);
    });
  });

  describe('publicas de respuesta generica', () => {
    it('password/forgot y verify-email/resend responden 202 exista o no el correo', async () => {
      const a = await request(app).post(`${BASE}/password/forgot`).send({ email: 'nadie@foest.test' });
      expect(a.status).toBe(202);
      const b = await request(app).post(`${BASE}/verify-email/resend`).send({ email: 'nadie@foest.test' });
      expect(b.status).toBe(202);
    });
  });
});
