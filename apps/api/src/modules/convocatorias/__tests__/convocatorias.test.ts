import request from 'supertest';
import { crearClienteFake, valorEq, type ConsultaFake } from './supabase.fake';

const mockDb = crearClienteFake();

// Supabase simulado (sin credenciales): mismo cliente para admin y usuario.
jest.mock('../../../shared/supabase', () => ({
  supabaseAdmin: mockDb,
  getSupabaseAdmin: () => mockDb,
  supabaseAsUser: () => mockDb,
  __setSupabaseAdminForTests: () => undefined,
}));

// authenticate() simulado: el rol viene en la cabecera `x-test-rol`; sin ella -> 401.
jest.mock('../../../shared/auth.middleware', () => {
  const { AppError } = jest.requireActual('../../../shared/errors');
  return {
    authenticate: () => (req: { headers: Record<string, unknown>; user?: unknown }, _res: unknown, next: (e?: unknown) => void) => {
      const rol = req.headers['x-test-rol'];
      if (!rol) return next(AppError.noAutenticado());
      req.user = { id: String(req.headers['x-test-id'] ?? '11111111-1111-4111-8111-111111111111'), email: 'qa@foest.test', rol, token: 'token-prueba' };
      return next();
    },
    usuarioActual: (req: { user?: unknown }) => {
      if (!req.user) throw AppError.noAutenticado();
      return req.user;
    },
  };
});

import { createApp } from '../../../app';
import { cierreExclusivoDesdeFechaLocal, estaAbierta, fechaCierrePresentada, inicioDiaLocal } from '../convocatorias.fechas';
import { convocatoriasService } from '../convocatorias.service';

const ID = '7b1a6f2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const ID_FUNC = '22222222-2222-4222-8222-222222222222';
const ADMIN = { 'x-test-rol': 'ADMINISTRADOR' };
const FUNCIONARIO = { 'x-test-rol': 'FUNCIONARIO', 'x-test-id': ID_FUNC };
const BENEFICIARIO = { 'x-test-rol': 'BENEFICIARIO' };

const futuro = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

function filaConvocatoria(extra: Partial<Record<string, unknown>> = {}) {
  return {
    id: ID,
    anio: 2026,
    semestre: 1,
    nombre: 'Convocatoria 2026-1',
    descripcion: 'Descripcion de prueba',
    fecha_apertura: futuro(-5),
    fecha_cierre_exclusiva: futuro(10),
    estado: 'HABILITADA',
    motivo_suspension: null,
    recordatorio_cierre_enviado_en: null,
    version: 3,
    creado_por: null,
    creado_en: futuro(-6),
    actualizado_en: futuro(-6),
    convocatoria_beneficio: [
      {
        convocatoria_id: ID,
        beneficio_id: 'b-sup',
        cupos_estimados: 10,
        presupuesto_asignado: 1000000,
        valor_apoyo_referencial: 100000,
        beneficio: { id: 'b-sup', codigo: 'SUP', nombre: 'Matricula Educacion Superior', categoria: 'MATRICULA', descripcion: 'Apoyo', activo: true },
      },
    ],
    ...extra,
  };
}

/** Manejadores por defecto: auditoria y tablas auxiliares vacias. */
function manejadoresBase(convocatoria: Record<string, unknown> | null) {
  mockDb.reiniciar();
  convocatoriasService.__invalidarCachePublico();
  mockDb.manejadores.auditoria_evento = () => ({ data: { id: 'audit-1' } });
  mockDb.manejadores.configuracion_sistema = () => ({ data: null });
  mockDb.manejadores.convocatoria_cambio_estado = (q) => ({ data: q.op === 'insert' ? null : [] });
  mockDb.manejadores.ampliacion_convocatoria = (q) => ({ data: q.op === 'insert' ? null : [] });
  mockDb.manejadores.asignacion_funcionario = () => ({ data: [] });
  mockDb.manejadores.postulacion = () => ({ data: [] });
  mockDb.manejadores.notificacion = () => ({ data: null });
  mockDb.manejadores.beneficio = () => ({
    data: [{ id: 'b-sup', codigo: 'SUP', nombre: 'Matricula Educacion Superior', categoria: 'MATRICULA', descripcion: 'Apoyo', activo: true }],
  });
  mockDb.manejadores.convocatoria_beneficio = () => ({ data: null });
  mockDb.manejadores.convocatoria = (q: ConsultaFake) => {
    if (q.op === 'select') return { data: q.single ? convocatoria : convocatoria ? [convocatoria] : [], count: convocatoria ? 1 : 0 };
    if (q.op === 'update') {
      if (!convocatoria) return { data: null };
      const versionEsperada = valorEq(q, 'version');
      if (versionEsperada !== undefined && versionEsperada !== convocatoria.version) return { data: null };
      const actualizado = { ...convocatoria, ...(q.payload as object) };
      Object.assign(convocatoria, actualizado);
      return { data: actualizado };
    }
    return { data: null };
  };
}

describe('helpers de fechas (America/Bogota)', () => {
  it('fecha_cierre_exclusiva es las 00:00 locales del dia siguiente (UTC-5)', () => {
    expect(cierreExclusivoDesdeFechaLocal('2026-03-31').toISOString()).toBe('2026-04-01T05:00:00.000Z');
    expect(inicioDiaLocal('2026-03-01').toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(fechaCierrePresentada('2026-04-01T05:00:00.000Z')).toBe('2026-03-31');
  });

  it('abierta a las 23:59:59 locales del ultimo dia y cerrada a las 00:00:00 del siguiente', () => {
    const c = { estado: 'HABILITADA' as const, fecha_apertura: '2026-03-01T05:00:00.000Z', fecha_cierre_exclusiva: '2026-04-01T05:00:00.000Z' };
    expect(estaAbierta(c, new Date('2026-04-01T04:59:59.000Z'))).toBe(true);
    expect(estaAbierta(c, new Date('2026-04-01T05:00:00.000Z'))).toBe(false);
    expect(estaAbierta({ ...c, estado: 'SUSPENDIDA' }, new Date('2026-03-15T12:00:00.000Z'))).toBe(false);
  });
});

describe('API /api/v1/convocatorias', () => {
  const app = createApp();

  it('401 sin token', async () => {
    const res = await request(app).get('/api/v1/convocatorias');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_AUTENTICADO');
  });

  it('403 cuando el rol no tiene el permiso (beneficiario crea)', async () => {
    const res = await request(app).post('/api/v1/convocatorias').set(BENEFICIARIO).send({});
    expect(res.status).toBe(403);
  });

  it('404 cuando un funcionario consulta una convocatoria ajena a su comite', async () => {
    manejadoresBase(null); // RLS no devuelve la fila
    const res = await request(app).get(`/api/v1/convocatorias/${ID}`).set(FUNCIONARIO);
    expect(res.status).toBe(404);
    // Abierta (RLS la devuelve a cualquier autenticado) pero sin asignacion al comite -> 404 igualmente
    manejadoresBase(filaConvocatoria());
    const res2 = await request(app).get(`/api/v1/convocatorias/${ID}`).set(FUNCIONARIO);
    expect(res2.status).toBe(404);
    const lista = await request(app).get('/api/v1/convocatorias').set(FUNCIONARIO);
    expect(lista.status).toBe(200);
    expect(lista.body.total).toBe(0);
  });

  it('200 cuando el funcionario pertenece al comite', async () => {
    manejadoresBase(filaConvocatoria());
    mockDb.manejadores.asignacion_funcionario = () => ({ data: [{ convocatoria_id: ID, funcionario_id: ID_FUNC, asignado_en: futuro(-1), usuario: null }] });
    const res = await request(app).get(`/api/v1/convocatorias/${ID}`).set(FUNCIONARIO);
    expect(res.status).toBe(200);
    expect(res.body.comite).toEqual([]); // el funcionario no recibe el comite
  });

  it('404 cuando un beneficiario consulta una convocatoria no abierta', async () => {
    manejadoresBase(filaConvocatoria({ estado: 'BORRADOR' }));
    const res = await request(app).get(`/api/v1/convocatorias/${ID}`).set(BENEFICIARIO);
    expect(res.status).toBe(404);
  });

  it('caso feliz: POST crea un BORRADOR con beneficios y responde 201', async () => {
    const creada = filaConvocatoria({ estado: 'BORRADOR', version: 0 });
    manejadoresBase(creada);
    mockDb.manejadores.convocatoria = (q) => {
      if (q.op === 'insert') return { data: { ...creada, convocatoria_beneficio: undefined } };
      return { data: q.single ? creada : [creada], count: 1 };
    };
    const res = await request(app)
      .post('/api/v1/convocatorias')
      .set(ADMIN)
      .send({
        anio: 2026,
        semestre: 1,
        nombre: 'Convocatoria 2026-1',
        descripcion: 'Descripcion de prueba',
        fecha_apertura: '2026-03-01',
        fecha_cierre: '2026-03-31',
        beneficios: [{ codigo: 'SUP', cupos_estimados: 10, presupuesto_asignado: 1000000, valor_apoyo_referencial: 100000 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('BORRADOR');
    expect(res.body.beneficios[0].codigo).toBe('SUP');
    const insercion = mockDb.consultas.find((c) => c.tabla === 'convocatoria' && c.op === 'insert');
    expect((insercion?.payload as { fecha_cierre_exclusiva: string }).fecha_cierre_exclusiva).toBe('2026-04-01T05:00:00.000Z');
    expect(mockDb.consultas.some((c) => c.tabla === 'auditoria_evento' && c.op === 'insert')).toBe(true);
    expect(mockDb.consultas.some((c) => c.tabla === 'convocatoria_cambio_estado' && c.op === 'insert')).toBe(true);
  });

  it('409 CONVOCATORIA_DUPLICADA por UNIQUE(anio, semestre)', async () => {
    manejadoresBase(null);
    mockDb.manejadores.convocatoria = (q) => (q.op === 'insert' ? { data: null, error: { code: '23505', message: 'duplicate key' } } : { data: null });
    const res = await request(app)
      .post('/api/v1/convocatorias')
      .set(ADMIN)
      .send({ anio: 2026, semestre: 1, nombre: 'Repetida', fecha_apertura: '2026-03-01', fecha_cierre: '2026-03-31', beneficios: [] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONVOCATORIA_DUPLICADA');
  });

  it('422 cuando se amplia sin motivo (y con motivo corto)', async () => {
    manejadoresBase(filaConvocatoria());
    const sinMotivo = await request(app).patch(`/api/v1/convocatorias/${ID}/ampliar`).set(ADMIN).send({ fecha_cierre_nueva: '2027-01-31', confirmar: true });
    expect(sinMotivo.status).toBe(422);
    const corto = await request(app)
      .patch(`/api/v1/convocatorias/${ID}/ampliar`)
      .set(ADMIN)
      .send({ fecha_cierre_nueva: '2027-01-31', confirmar: true, motivo: 'corto' });
    expect(corto.status).toBe(422);
  });

  it('ampliar sobre CERRADA la reabre (REAPERTURA) y reinicia el recordatorio', async () => {
    const cerrada = filaConvocatoria({ estado: 'CERRADA', fecha_cierre_exclusiva: futuro(-2), recordatorio_cierre_enviado_en: futuro(-3) });
    manejadoresBase(cerrada);
    const res = await request(app)
      .patch(`/api/v1/convocatorias/${ID}/ampliar`)
      .set(ADMIN)
      .send({ fecha_cierre_nueva: '2027-01-31', confirmar: true, motivo: 'Se reabre por solicitud del comite para ampliar cobertura', version: 3 });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('HABILITADA');
    const ampliacion = mockDb.consultas.find((c) => c.tabla === 'ampliacion_convocatoria' && c.op === 'insert');
    expect((ampliacion?.payload as { tipo: string }).tipo).toBe('REAPERTURA');
    const update = mockDb.consultas.find((c) => c.tabla === 'convocatoria' && c.op === 'update');
    expect((update?.payload as { recordatorio_cierre_enviado_en: unknown }).recordatorio_cierre_enviado_en).toBeNull();
  });

  it('409 POSTULACIONES_EN_CURSO al archivar con postulaciones no terminales', async () => {
    manejadoresBase(filaConvocatoria({ estado: 'CERRADA', fecha_cierre_exclusiva: futuro(-1) }));
    mockDb.manejadores.postulacion = () => ({ data: [{ estado: 'PENDIENTE' }, { estado: 'APROBADA' }] });
    const res = await request(app).patch(`/api/v1/convocatorias/${ID}/archivar`).set(ADMIN).send({ confirmar: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POSTULACIONES_EN_CURSO');
    expect(res.body.details.por_estado).toEqual({ PENDIENTE: 1 });
  });

  it('archivar con todas las postulaciones terminales pasa a ARCHIVADA', async () => {
    manejadoresBase(filaConvocatoria({ estado: 'CERRADA', fecha_cierre_exclusiva: futuro(-1) }));
    mockDb.manejadores.postulacion = () => ({ data: [{ estado: 'APROBADA' }, { estado: 'RECHAZADA' }] });
    const res = await request(app).patch(`/api/v1/convocatorias/${ID}/archivar`).set(ADMIN).send({ confirmar: true });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ARCHIVADA');
  });

  it('409 VERSION_DESACTUALIZADA en PUT con version vieja', async () => {
    manejadoresBase(filaConvocatoria({ estado: 'BORRADOR', version: 5 }));
    const res = await request(app).put(`/api/v1/convocatorias/${ID}`).set(ADMIN).send({ version: 4, nombre: 'Nuevo nombre' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VERSION_DESACTUALIZADA');
  });

  it('422 SIN_COMITE al habilitar un borrador sin funcionarios', async () => {
    manejadoresBase(filaConvocatoria({ estado: 'BORRADOR' }));
    const res = await request(app).patch(`/api/v1/convocatorias/${ID}/habilitar`).set(ADMIN).send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SIN_COMITE');
  });

  it('una HABILITADA vencida se trata como CERRADA aunque el cron no haya corrido', async () => {
    const vencida = filaConvocatoria({ fecha_cierre_exclusiva: futuro(-1) });
    manejadoresBase(vencida);
    const res = await request(app).get(`/api/v1/convocatorias/${ID}`).set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('CERRADA');
    expect(res.body.abierta).toBe(false);
    const cambio = mockDb.consultas.find((c) => c.tabla === 'convocatoria_cambio_estado' && c.op === 'insert');
    expect((cambio?.payload as { origen: string }).origen).toBe('TIEMPO_REAL');
  });

  it('PUT /:id/funcionarios responde 409 ASIGNACIONES_PENDIENTES si un retirado tiene expedientes en evaluacion', async () => {
    manejadoresBase(filaConvocatoria());
    mockDb.manejadores.asignacion_funcionario = (q) =>
      q.op === 'select' ? { data: [{ funcionario_id: ID_FUNC, asignado_en: futuro(-1), usuario: { email: 'f@x.co', activo: true, funcionario: null } }] } : { data: null };
    mockDb.manejadores.postulacion = () => ({ data: [{ id: 'p1', estado: 'EN_EVALUACION' }] });
    const OTRO = '33333333-3333-4333-8333-333333333333';
    mockDb.manejadores.usuario = () => ({ data: [{ id: OTRO, rol: 'FUNCIONARIO', activo: true }] });
    const res = await request(app).put(`/api/v1/convocatorias/${ID}/funcionarios`).set(ADMIN).send({ funcionario_ids: [OTRO] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASIGNACIONES_PENDIENTES');
    expect(res.body.details.expedientes_afectados[0]).toEqual({ funcionario_id: ID_FUNC, postulacion_ids: ['p1'] });
  });

  it('PUT /:id/funcionarios reemplaza el comite con funcionarios activos', async () => {
    manejadoresBase(filaConvocatoria({ estado: 'BORRADOR' }));
    mockDb.manejadores.usuario = () => ({ data: [{ id: ID_FUNC, rol: 'FUNCIONARIO', activo: true }] });
    let comite: unknown[] = [];
    mockDb.manejadores.asignacion_funcionario = (q) => {
      if (q.op === 'insert') {
        comite = (q.payload as Array<{ funcionario_id: string }>).map((a) => ({ funcionario_id: a.funcionario_id, asignado_en: futuro(0), usuario: { email: 'f@x.co', activo: true, funcionario: { nombres: 'Ana', apellidos: 'Perez', cargo: 'Profesional' } } }));
        return { data: null };
      }
      return { data: comite };
    };
    const res = await request(app).put(`/api/v1/convocatorias/${ID}/funcionarios`).set(ADMIN).send({ funcionario_ids: [ID_FUNC] });
    expect(res.status).toBe(200);
    expect(res.body.agregados).toEqual([ID_FUNC]);
    expect(res.body.comite[0]).toMatchObject({ funcionario_id: ID_FUNC, nombres: 'Ana' });
  });
});

describe('API publica /api/v1/publico/convocatorias (sin token)', () => {
  const app = createApp();

  it('lista solo HABILITADA vigentes sin datos internos', async () => {
    manejadoresBase(filaConvocatoria());
    const res = await request(app).get('/api/v1/publico/convocatorias');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: ID, nombre: 'Convocatoria 2026-1' });
    expect(res.body.data[0]).not.toHaveProperty('motivo_suspension');
    expect(res.body.data[0].beneficios[0]).not.toHaveProperty('presupuesto_asignado');
    const consulta = mockDb.consultas.find((c) => c.tabla === 'convocatoria');
    expect(consulta?.filtros.some((f) => f.metodo === 'eq' && f.args[0] === 'estado' && f.args[1] === 'HABILITADA')).toBe(true);
  });

  it('404 para una convocatoria no vigente', async () => {
    manejadoresBase(filaConvocatoria({ estado: 'SUSPENDIDA' }));
    const res = await request(app).get(`/api/v1/publico/convocatorias/${ID}`);
    expect(res.status).toBe(404);
  });
});
