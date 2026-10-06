import request from 'supertest';
import { crearFakeSupabase, type FakeSupabase } from './fake-supabase';

const mockEstado: { fake: FakeSupabase | null } = { fake: null };

jest.mock('../../../config/env', () => ({
  ...jest.requireActual('../../../config/env'),
  hasSupabaseCredentials: () => true,
}));

jest.mock('../../../shared/supabase', () => {
  const admin = new Proxy(
    {},
    {
      get(_t, prop) {
        const real = mockEstado.fake!.clienteAdmin as unknown as Record<string | symbol, unknown>;
        return real[prop];
      },
    },
  );
  return {
    supabaseAdmin: admin,
    getSupabaseAdmin: () => admin,
    supabaseAsUser: () => mockEstado.fake!.clienteUsuario(),
    __setSupabaseAdminForTests: () => undefined,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require('../../../app') as typeof import('../../../app');

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const N1 = 'a1a1a1a1-0000-4000-8000-000000000001';
const N2 = 'a2a2a2a2-0000-4000-8000-000000000002';
const N3 = 'a3a3a3a3-0000-4000-8000-000000000003';
const N4 = 'a4a4a4a4-0000-4000-8000-000000000004';
const TOK = { benef: 'tok-benef', func: 'tok-func', admin: 'tok-admin' };
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

function prepararFake() {
  mockEstado.fake = crearFakeSupabase(
    {
      notificacion: [
        { id: N1, usuario_id: U1, tipo: 'CORRECCION', titulo: 'Critica', mensaje: 'm', entidad: null, entidad_id: null, url_destino: null, severidad: 'CRITICA', leida: false, leida_en: null, creada_en: '2026-01-03T00:00:00.000Z' },
        { id: N2, usuario_id: U1, tipo: 'INFO', titulo: 'Info', mensaje: 'm', entidad: null, entidad_id: null, url_destino: null, severidad: 'INFO', leida: false, leida_en: null, creada_en: '2026-01-02T00:00:00.000Z' },
        { id: N4, usuario_id: U1, tipo: 'INFO', titulo: 'Leida', mensaje: 'm', entidad: null, entidad_id: null, url_destino: null, severidad: 'INFO', leida: true, leida_en: '2026-01-01T01:00:00.000Z', creada_en: '2026-01-01T00:00:00.000Z' },
        { id: N3, usuario_id: U2, tipo: 'INFO', titulo: 'Ajena', mensaje: 'm', entidad: null, entidad_id: null, url_destino: null, severidad: 'INFO', leida: false, leida_en: null, creada_en: '2026-01-03T00:00:00.000Z' },
      ],
    },
    {
      [TOK.benef]: { id: U1, email: 'laura@foest.test', rol: 'BENEFICIARIO' },
      [TOK.func]: { id: U2, email: 'func@foest.test', rol: 'FUNCIONARIO' },
      [TOK.admin]: { id: 'ad000000-0000-4000-8000-000000000000', email: 'admin@foest.test', rol: 'ADMINISTRADOR' },
    },
  );
  return mockEstado.fake;
}

describe('notificaciones (buzon in-app, cualquier rol)', () => {
  const app = createApp();

  beforeEach(() => {
    prepararFake();
  });

  it('401 sin token', async () => {
    expect((await request(app).get('/api/v1/notificaciones/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/notificaciones/me/no-leidas/contador')).status).toBe(401);
    expect((await request(app).patch(`/api/v1/notificaciones/${N1}/leida`)).status).toBe(401);
    expect((await request(app).patch('/api/v1/notificaciones/leer-todas')).status).toBe(401);
  });

  it('lista paginada solo con las propias, mas recientes primero, con filtro leida=false', async () => {
    const res = await request(app).get('/api/v1/notificaciones/me').set(auth(TOK.benef));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, page_size: 20, total: 3 });
    expect(res.body.data.map((n: { id: string }) => n.id)).toEqual([N1, N2, N4]);
    expect(res.body.data[0].creada_en_texto).toEqual(expect.any(String));

    const noLeidas = await request(app).get('/api/v1/notificaciones/me?leida=false&page_size=1').set(auth(TOK.benef));
    expect(noLeidas.body).toMatchObject({ page: 1, page_size: 1, total: 2 });
    expect(noLeidas.body.data).toHaveLength(1);

    const ajena = await request(app).get('/api/v1/notificaciones/me').set(auth(TOK.func));
    expect(ajena.body.data.map((n: { id: string }) => n.id)).toEqual([N3]);
  });

  it('422 con paginacion invalida', async () => {
    const res = await request(app).get('/api/v1/notificaciones/me?page=0').set(auth(TOK.benef));
    expect(res.status).toBe(422);
  });

  it('contador de no leidas y criticas; funciona para los tres roles', async () => {
    const b = await request(app).get('/api/v1/notificaciones/me/no-leidas/contador').set(auth(TOK.benef));
    expect(b.body).toEqual({ no_leidas: 2, criticas_no_leidas: 1 });
    const f = await request(app).get('/api/v1/notificaciones/me/no-leidas/contador').set(auth(TOK.func));
    expect(f.body).toEqual({ no_leidas: 1, criticas_no_leidas: 0 });
    const a = await request(app).get('/api/v1/notificaciones/me/no-leidas/contador').set(auth(TOK.admin));
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ no_leidas: 0, criticas_no_leidas: 0 });
  });

  it('PATCH /:id/leida es idempotente, baja el contador y responde 404 en ajena', async () => {
    const primera = await request(app).patch(`/api/v1/notificaciones/${N1}/leida`).set(auth(TOK.benef));
    expect(primera.status).toBe(200);
    expect(primera.body).toMatchObject({ id: N1, leida: true });
    expect(primera.body.leida_en).toEqual(expect.any(String));

    const segunda = await request(app).patch(`/api/v1/notificaciones/${N1}/leida`).set(auth(TOK.benef));
    expect(segunda.status).toBe(200);
    expect(segunda.body.leida_en).toBe(primera.body.leida_en);

    const contador = await request(app).get('/api/v1/notificaciones/me/no-leidas/contador').set(auth(TOK.benef));
    expect(contador.body).toEqual({ no_leidas: 1, criticas_no_leidas: 0 });

    const ajena = await request(app).patch(`/api/v1/notificaciones/${N3}/leida`).set(auth(TOK.benef));
    expect(ajena.status).toBe(404);
    const invalida = await request(app).patch('/api/v1/notificaciones/abc/leida').set(auth(TOK.benef));
    expect(invalida.status).toBe(422);
  });

  it('PATCH /leer-todas deja el contador en cero y devuelve la cantidad afectada', async () => {
    const res = await request(app).patch('/api/v1/notificaciones/leer-todas').set(auth(TOK.benef));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ afectadas: 2 });
    const contador = await request(app).get('/api/v1/notificaciones/me/no-leidas/contador').set(auth(TOK.benef));
    expect(contador.body).toEqual({ no_leidas: 0, criticas_no_leidas: 0 });
    // Las ajenas no se tocan
    const otro = await request(app).get('/api/v1/notificaciones/me/no-leidas/contador').set(auth(TOK.func));
    expect(otro.body.no_leidas).toBe(1);
  });
});
