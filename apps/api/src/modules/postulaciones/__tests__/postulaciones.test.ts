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
      req.user = { id: String(req.headers['x-test-id'] ?? USUARIO_ID), email: 'qa+postulaciones@foest.test', rol, token: 'token-prueba' };
      return next();
    },
    usuarioActual: (req: { user?: unknown }) => {
      if (!req.user) throw AppError.noAutenticado();
      return req.user;
    },
  };
});

import { createApp } from '../../../app';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const BENEFICIARIO_ID = '22222222-2222-4222-8222-222222222222';
const CONVOCATORIA_ID = '33333333-3333-4333-8333-333333333333';
const POSTULACION_ID = '44444444-4444-4444-8444-444444444444';
const AJENA_ID = '55555555-5555-4555-8555-555555555555';

const BENEFICIARIO = { 'x-test-rol': 'BENEFICIARIO' };
const FUNCIONARIO = { 'x-test-rol': 'FUNCIONARIO' };
const ADMIN = { 'x-test-rol': 'ADMINISTRADOR' };

const futuro = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

function filaPostulacion(extra: Record<string, unknown> = {}) {
  return {
    id: POSTULACION_ID,
    beneficiario_id: BENEFICIARIO_ID,
    convocatoria_id: CONVOCATORIA_ID,
    tipo_solicitud: 'PRIMERA_VEZ',
    estado: 'BORRADOR',
    datos_formulario: {},
    correcciones_perfil: null,
    correccion_vigente: null,
    valor_matricula_letras: null,
    ciclo: 0,
    version: 2,
    aprobacion_parcial: false,
    fecha_limite_subsanacion: null,
    enviada_en: null,
    creado_en: futuro(-1),
    actualizado_en: futuro(-1),
    ...extra,
  };
}

const convocatoriaAbierta = {
  id: CONVOCATORIA_ID,
  nombre: 'Convocatoria 2026-1',
  anio: 2026,
  semestre: 1,
  estado: 'HABILITADA',
  fecha_apertura: futuro(-5),
  fecha_cierre_exclusiva: futuro(10),
};

const declaraciones = ['DECL_1', 'DECL_2', 'DECL_3', 'DECL_4', 'DECL_5', 'DECL_6'].map((codigo) => ({
  codigo,
  version: 1,
  titulo: `Declaracion ${codigo}`,
  texto: 'Texto provisional',
  texto_oficial_confirmado: false,
}));

const formularioCompleto = {
  seccion_3: { personas_a_cargo: 0, situacion_laboral: 'SOLO_ESTUDIA', contacto_emergencia: { nombre: 'Ana Perez', parentesco: 'Madre', telefono: '3001234567' } },
  seccion_4: { snies_codigo: '12345', institucion: 'Universidad de Prueba', programa: 'Ingenieria', semestre: 1, modalidad: 'PRESENCIAL' },
  seccion_5: { colegio: 'IE Tocancipa', anio_graduacion: 2025, registro_saber11: 'AC202512345' },
  seccion_7: { valor_matricula: 4850000 },
};

/** Manejadores por defecto para un beneficiario con perfil completo y un borrador propio. */
function escenarioBase(opts: { perfilCompleto?: boolean; postulacion?: Record<string, unknown> | null; beneficios?: string[] } = {}) {
  mockDb.reiniciar();
  const postulacion = opts.postulacion === undefined ? filaPostulacion() : opts.postulacion;
  mockDb.manejadores.auditoria_evento = () => ({ data: { id: 'audit-1' } });
  mockDb.manejadores.beneficiario = (q) => ({
    data: valorEq(q, 'usuario_id') === USUARIO_ID
      ? { id: BENEFICIARIO_ID, usuario_id: USUARIO_ID, perfil_completo: opts.perfilCompleto ?? true, es_menor: false, nombres: 'Juan', apellidos: 'Perez', numero_documento: '1000', tipo_documento: 'CC' }
      : null,
  });
  mockDb.manejadores.convocatoria = (q) => ({ data: valorEq(q, 'id') === CONVOCATORIA_ID ? convocatoriaAbierta : q.single ? null : [convocatoriaAbierta] });
  mockDb.manejadores.convocatoria_beneficio = () => ({ data: [{ beneficio: { codigo: 'SUP' } }, { beneficio: { codigo: 'ST' } }] });
  mockDb.manejadores.declaracion_juramentada = () => ({ data: declaraciones });
  mockDb.manejadores.historial_estado_postulacion = (q) => ({ data: q.op === 'insert' ? null : [] });
  mockDb.manejadores.postulacion_beneficio = (q) =>
    q.op === 'select'
      ? { data: (opts.beneficios ?? ['SUP']).map((b) => ({ postulacion_id: POSTULACION_ID, beneficio_codigo: b })) }
      : { data: null };
  mockDb.manejadores.postulacion_envio = () => ({ data: null });
  mockDb.manejadores.documento = () => ({ data: null, error: { message: 'relation "documento" does not exist' } });
  mockDb.manejadores.postulacion = (q: ConsultaFake) => {
    if (q.op === 'select') {
      const id = valorEq(q, 'id');
      if (id !== undefined) return { data: id === POSTULACION_ID ? postulacion : null };
      if (valorEq(q, 'estado') === 'APROBADA') return { data: [], count: 0 }; // elegibilidad provisional
      return { data: postulacion ? [postulacion] : [], count: postulacion ? 1 : 0 };
    }
    if (q.op === 'update') {
      if (valorEq(q, 'version') !== (postulacion as { version: number } | null)?.version) return { data: null };
      return { data: { ...(postulacion ?? {}), ...(q.payload as object) } };
    }
    if (q.op === 'insert') return { data: { ...filaPostulacion({ version: 0 }), ...(q.payload as object) } };
    return { data: null };
  };
  return postulacion;
}

describe('POST /api/v1/postulaciones', () => {
  const app = createApp();

  it('401 sin token', async () => {
    const res = await request(app).get('/api/v1/postulaciones/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_AUTENTICADO');
  });

  it('403 si el rol no puede crear (FUNCIONARIO)', async () => {
    escenarioBase();
    const res = await request(app).post('/api/v1/postulaciones').set(FUNCIONARIO).send({ convocatoria_id: CONVOCATORIA_ID, tipo_solicitud: 'PRIMERA_VEZ' });
    expect(res.status).toBe(403);
  });

  it('422 PERFIL_INCOMPLETO cuando el perfil no esta completo', async () => {
    escenarioBase({ perfilCompleto: false });
    const res = await request(app).post('/api/v1/postulaciones').set(BENEFICIARIO).send({ convocatoria_id: CONVOCATORIA_ID, tipo_solicitud: 'PRIMERA_VEZ' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PERFIL_INCOMPLETO');
  });

  it('422 CONVOCATORIA_NO_ABIERTA cuando la convocatoria esta cerrada', async () => {
    escenarioBase();
    mockDb.manejadores.convocatoria = () => ({ data: { ...convocatoriaAbierta, estado: 'CERRADA' } });
    const res = await request(app).post('/api/v1/postulaciones').set(BENEFICIARIO).send({ convocatoria_id: CONVOCATORIA_ID, tipo_solicitud: 'PRIMERA_VEZ' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CONVOCATORIA_NO_ABIERTA');
  });

  it('422 TRAMITE_NO_ELEGIBLE para RENOVACION sin aprobadas previas', async () => {
    escenarioBase();
    const res = await request(app).post('/api/v1/postulaciones').set(BENEFICIARIO).send({ convocatoria_id: CONVOCATORIA_ID, tipo_solicitud: 'RENOVACION' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('TRAMITE_NO_ELEGIBLE');
  });

  it('409 POSTULACION_DUPLICADA cuando ya existe (unique de BD)', async () => {
    escenarioBase();
    const original = mockDb.manejadores.postulacion;
    mockDb.manejadores.postulacion = (q) => (q.op === 'insert' ? { data: null, error: { code: '23505', message: 'duplicate key' } } : original!(q));
    const res = await request(app).post('/api/v1/postulaciones').set(BENEFICIARIO).send({ convocatoria_id: CONVOCATORIA_ID, tipo_solicitud: 'PRIMERA_VEZ' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POSTULACION_DUPLICADA');
  });

  it('201 crea el borrador con historial y auditoria', async () => {
    escenarioBase();
    const res = await request(app)
      .post('/api/v1/postulaciones')
      .set(BENEFICIARIO)
      .send({ convocatoria_id: CONVOCATORIA_ID, tipo_solicitud: 'PRIMERA_VEZ', beneficios: ['SUP'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ estado: 'BORRADOR', estado_texto: 'Borrador sin enviar', tipo_solicitud: 'PRIMERA_VEZ' });
    expect(mockDb.consultas.some((c) => c.tabla === 'historial_estado_postulacion' && c.op === 'insert')).toBe(true);
    expect(mockDb.consultas.some((c) => c.tabla === 'auditoria_evento' && c.op === 'insert')).toBe(true);
  });

  it('422 BENEFICIO_NO_OFERTADO si el beneficio no esta en la convocatoria', async () => {
    escenarioBase();
    const res = await request(app)
      .post('/api/v1/postulaciones')
      .set(BENEFICIARIO)
      .send({ convocatoria_id: CONVOCATORIA_ID, tipo_solicitud: 'PRIMERA_VEZ', beneficios: ['LE1'] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BENEFICIO_NO_OFERTADO');
  });
});

describe('GET /api/v1/postulaciones/:id y acceso', () => {
  const app = createApp();

  it('404 para una postulacion ajena', async () => {
    escenarioBase();
    const res = await request(app).get(`/api/v1/postulaciones/${AJENA_ID}`).set(BENEFICIARIO);
    expect(res.status).toBe(404);
  });

  it('403 para FUNCIONARIO (DECISIONES seccion 18)', async () => {
    escenarioBase();
    const res = await request(app).get(`/api/v1/postulaciones/${POSTULACION_ID}`).set(FUNCIONARIO);
    expect(res.status).toBe(403);
  });

  it('200 propia sin datos de actor en correccion_vigente', async () => {
    escenarioBase({
      postulacion: filaPostulacion({
        estado: 'EN_CORRECCION',
        correccion_vigente: { observaciones: 'Falta soporte', campos_observados: ['seccion_4.semestre'], actor_id: 'func-1', actor_tipo: 'FUNCIONARIO' },
      }),
    });
    const res = await request(app).get(`/api/v1/postulaciones/${POSTULACION_ID}`).set(BENEFICIARIO);
    expect(res.status).toBe(200);
    expect(res.body.correccion_vigente).toEqual({
      firma: 'Equipo FOEST',
      observaciones: 'Falta soporte',
      campos_observados: ['seccion_4.semestre'],
      documentos_observados: [],
    });
    expect(JSON.stringify(res.body)).not.toContain('func-1');
  });

  it('GET / con BENEFICIARIO -> 403; con ADMINISTRADOR -> 200 auditado', async () => {
    escenarioBase();
    const r1 = await request(app).get('/api/v1/postulaciones').set(BENEFICIARIO);
    expect(r1.status).toBe(403);
    const r2 = await request(app).get('/api/v1/postulaciones?estado=BORRADOR&q=Juan').set(ADMIN);
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ page: 1, page_size: 20, total: 1 });
    expect(mockDb.consultas.some((c) => c.tabla === 'auditoria_evento' && (c.payload as { accion: string }).accion === 'LISTADO_POSTULACIONES')).toBe(true);
  });

  it('GET /me lista las propias con estado en lenguaje claro', async () => {
    escenarioBase();
    const res = await request(app).get('/api/v1/postulaciones/me').set(BENEFICIARIO);
    expect(res.status).toBe(200);
    expect(res.body.data[0].estado_texto).toBe('Borrador sin enviar');
  });
});

describe('PUT /api/v1/postulaciones/:id (autoguardado)', () => {
  const app = createApp();

  it('409 VERSION_CONFLICTO con version desactualizada', async () => {
    escenarioBase();
    const res = await request(app).put(`/api/v1/postulaciones/${POSTULACION_ID}`).set(BENEFICIARIO).send({ version: 1, datos_formulario: { seccion_7: { valor_matricula: 100 } } });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VERSION_CONFLICTO');
  });

  it('guarda por secciones y genera valor_matricula_letras en el servidor', async () => {
    escenarioBase();
    const res = await request(app)
      .put(`/api/v1/postulaciones/${POSTULACION_ID}`)
      .set(BENEFICIARIO)
      .send({ version: 2, datos_formulario: { seccion_7: { valor_matricula: 4850000 } } });
    expect(res.status).toBe(200);
    expect(res.body.valor_matricula_letras).toBe('CUATRO MILLONES OCHOCIENTOS CINCUENTA MIL PESOS M/CTE');
    expect(res.body.version).toBe(3);
  });

  it('422 si el cliente intenta enviar valor_matricula_letras o campos fuera del esquema', async () => {
    escenarioBase();
    const res = await request(app)
      .put(`/api/v1/postulaciones/${POSTULACION_ID}`)
      .set(BENEFICIARIO)
      .send({ version: 2, valor_matricula_letras: 'X', datos_formulario: { seccion_3: { estrato: 3 } } });
    expect(res.status).toBe(422);
  });

  it('422 CAMPO_NO_EDITABLE en EN_CORRECCION fuera de campos_observados', async () => {
    escenarioBase({ postulacion: filaPostulacion({ estado: 'EN_CORRECCION', fecha_limite_subsanacion: futuro(3), correccion_vigente: { campos_observados: ['seccion_4.semestre'] } }) });
    const r1 = await request(app).put(`/api/v1/postulaciones/${POSTULACION_ID}`).set(BENEFICIARIO).send({ version: 2, datos_formulario: { seccion_7: { valor_matricula: 1 } } });
    expect(r1.status).toBe(422);
    expect(r1.body.code).toBe('CAMPO_NO_EDITABLE');
    const r2 = await request(app).put(`/api/v1/postulaciones/${POSTULACION_ID}`).set(BENEFICIARIO).send({ version: 2, datos_formulario: { seccion_4: { semestre: 3 } } });
    expect(r2.status).toBe(200);
  });

  it('cifra los datos de pago y solo devuelve el valor enmascarado', async () => {
    process.env.DATOS_PAGO_KEY = 'b'.repeat(64);
    escenarioBase({ beneficios: ['SUP', 'ST'] });
    const res = await request(app)
      .put(`/api/v1/postulaciones/${POSTULACION_ID}`)
      .set(BENEFICIARIO)
      .send({ version: 2, datos_pago: { tipo: 'CUENTA_BANCARIA', entidad: 'Banco de Prueba', numero: '0012345678' } });
    expect(res.status).toBe(200);
    expect(res.body.datos_formulario.seccion_8.datos_pago).toEqual({ tipo: 'CUENTA_BANCARIA', entidad: 'Banco de Prueba', numero_enmascarado: '•••• 5678' });
    const upsert = mockDb.consultas.find((c) => c.tabla === 'datos_pago_st' && c.op === 'upsert');
    expect(upsert).toBeDefined();
    expect((upsert!.payload as { numero_cifrado: string }).numero_cifrado).not.toContain('0012345678');
    expect(JSON.stringify(res.body)).not.toContain('0012345678');
    delete process.env.DATOS_PAGO_KEY;
  });
});

describe('POST /api/v1/postulaciones/:id/enviar', () => {
  const app = createApp();

  it('422 EXPEDIENTE_INCOMPLETO con campos faltantes', async () => {
    escenarioBase();
    const res = await request(app)
      .post(`/api/v1/postulaciones/${POSTULACION_ID}/enviar`)
      .set(BENEFICIARIO)
      .set('Idempotency-Key', 'k-1')
      .send({ confirmar: true, declaraciones_aceptadas: declaraciones.map((d) => d.codigo) });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('EXPEDIENTE_INCOMPLETO');
    expect(res.body.details.campos_faltantes.length).toBeGreaterThan(0);
    expect(mockDb.llamadasRpc).toHaveLength(0);
  });

  it('422 EXPEDIENTE_INCOMPLETO si faltan declaraciones por aceptar', async () => {
    escenarioBase({ postulacion: filaPostulacion({ datos_formulario: formularioCompleto }) });
    const res = await request(app)
      .post(`/api/v1/postulaciones/${POSTULACION_ID}/enviar`)
      .set(BENEFICIARIO)
      .send({ confirmar: true, declaraciones_aceptadas: ['DECL_1'] });
    expect(res.status).toBe(422);
    expect(res.body.details.declaraciones_pendientes).toContain('DECL_2');
  });

  it('envia de forma atomica via fn_enviar_postulacion y es idempotente por Idempotency-Key', async () => {
    const p = escenarioBase({ postulacion: filaPostulacion({ datos_formulario: formularioCompleto }) }) as Record<string, unknown>;
    const envios: Array<{ ciclo: number; hash_envio: string; enviado_en: string; idempotency_key: string }> = [];
    mockDb.rpcs.fn_enviar_postulacion = (args) => {
      envios.push({ ciclo: 1, hash_envio: 'abc', enviado_en: futuro(0), idempotency_key: String(args.p_idempotency_key) });
      p.estado = 'PENDIENTE';
      p.ciclo = 1;
      p.version = 3;
      return { data: { postulacion_id: POSTULACION_ID, estado: 'PENDIENTE', ciclo: 1, version: 3, hash_envio: 'abc', enviado_en: futuro(0), repetido: false } };
    };
    mockDb.manejadores.postulacion_envio = (q) => ({ data: envios.find((e) => e.idempotency_key === valorEq(q, 'idempotency_key')) ?? null });

    const cuerpo = { confirmar: true, version: 2, declaraciones_aceptadas: declaraciones.map((d) => d.codigo) };
    const r1 = await request(app).post(`/api/v1/postulaciones/${POSTULACION_ID}/enviar`).set(BENEFICIARIO).set('Idempotency-Key', 'llave-1').send(cuerpo);
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ estado: 'PENDIENTE', ciclo: 1, repetido: false });
    expect(r1.body.postulacion.estado_texto).toBe('Recibida, en espera de revision');
    expect(mockDb.llamadasRpc).toHaveLength(1);
    expect(mockDb.llamadasRpc[0]!.args).toMatchObject({ p_modo: 'ENVIO', p_idempotency_key: 'llave-1', p_actor_id: USUARIO_ID });
    expect((mockDb.llamadasRpc[0]!.args.p_declaraciones as unknown[]).length).toBe(6);

    // Misma llave: mismo resultado, sin nuevo envio
    const r2 = await request(app).post(`/api/v1/postulaciones/${POSTULACION_ID}/enviar`).set(BENEFICIARIO).set('Idempotency-Key', 'llave-1').send(cuerpo);
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ ciclo: 1, hash_envio: 'abc', repetido: true });
    expect(mockDb.llamadasRpc).toHaveLength(1);

    // Otra llave sobre una postulacion ya enviada: 409 TRANSICION_INVALIDA
    const r3 = await request(app).post(`/api/v1/postulaciones/${POSTULACION_ID}/enviar`).set(BENEFICIARIO).set('Idempotency-Key', 'llave-2').send({ confirmar: true, declaraciones_aceptadas: cuerpo.declaraciones_aceptadas });
    expect(r3.status).toBe(409);
    expect(r3.body.code).toBe('TRANSICION_INVALIDA');
  });

  it('subsanar fuera de plazo -> 409 PLAZO_SUBSANACION_VENCIDO; desde PENDIENTE -> 409 TRANSICION_INVALIDA', async () => {
    escenarioBase({ postulacion: filaPostulacion({ estado: 'EN_CORRECCION', fecha_limite_subsanacion: futuro(-1), datos_formulario: formularioCompleto }) });
    const r1 = await request(app).post(`/api/v1/postulaciones/${POSTULACION_ID}/subsanar`).set(BENEFICIARIO).send({ confirmar: true });
    expect(r1.status).toBe(409);
    expect(r1.body.code).toBe('PLAZO_SUBSANACION_VENCIDO');

    escenarioBase({ postulacion: filaPostulacion({ estado: 'PENDIENTE' }) });
    const r2 = await request(app).post(`/api/v1/postulaciones/${POSTULACION_ID}/subsanar`).set(BENEFICIARIO).send({ confirmar: true });
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('TRANSICION_INVALIDA');
  });
});

describe('desistir, eliminar e historial', () => {
  const app = createApp();

  it('desistir desde PENDIENTE pasa por transicionar() y la funcion SQL', async () => {
    const p = escenarioBase({ postulacion: filaPostulacion({ estado: 'PENDIENTE', ciclo: 1 }) }) as Record<string, unknown>;
    mockDb.rpcs.fn_transicionar_postulacion = (args) => ({ data: { ...p, estado: args.p_estado_nuevo, version: 3 } });
    const res = await request(app).post(`/api/v1/postulaciones/${POSTULACION_ID}/desistir`).set(BENEFICIARIO).send({ motivo: 'Ya no requiero el apoyo' });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('DESISTIDA');
    expect(mockDb.llamadasRpc[0]).toMatchObject({ fn: 'fn_transicionar_postulacion', args: { p_estado_nuevo: 'DESISTIDA', p_motivo: 'DESISTIMIENTO', p_actor_tipo: 'BENEFICIARIO' } });
  });

  it('desistir desde BORRADOR -> 409', async () => {
    escenarioBase();
    const res = await request(app).post(`/api/v1/postulaciones/${POSTULACION_ID}/desistir`).set(BENEFICIARIO).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TRANSICION_INVALIDA');
  });

  it('DELETE solo en BORRADOR (204); en PENDIENTE 409', async () => {
    escenarioBase();
    const r1 = await request(app).delete(`/api/v1/postulaciones/${POSTULACION_ID}`).set(BENEFICIARIO);
    expect(r1.status).toBe(204);
    escenarioBase({ postulacion: filaPostulacion({ estado: 'PENDIENTE' }) });
    const r2 = await request(app).delete(`/api/v1/postulaciones/${POSTULACION_ID}`).set(BENEFICIARIO);
    expect(r2.status).toBe(409);
  });

  it('historial para el beneficiario oculta actor y movimientos internos', async () => {
    escenarioBase({ postulacion: filaPostulacion({ estado: 'EN_EVALUACION', ciclo: 1 }) });
    mockDb.manejadores.historial_estado_postulacion = () => ({
      data: [
        { id: 'h1', postulacion_id: POSTULACION_ID, ciclo: 0, estado_anterior: null, estado_nuevo: 'BORRADOR', motivo: 'CREACION', actor_tipo: 'BENEFICIARIO', actor_id: USUARIO_ID, observaciones: null, cambiado_en: futuro(-2) },
        { id: 'h2', postulacion_id: POSTULACION_ID, ciclo: 1, estado_anterior: 'BORRADOR', estado_nuevo: 'PENDIENTE', motivo: 'ENVIO', actor_tipo: 'BENEFICIARIO', actor_id: USUARIO_ID, observaciones: null, cambiado_en: futuro(-1) },
        { id: 'h3', postulacion_id: POSTULACION_ID, ciclo: 1, estado_anterior: 'PENDIENTE', estado_nuevo: 'EN_EVALUACION', motivo: 'TOMA', actor_tipo: 'FUNCIONARIO', actor_id: 'func-9', observaciones: 'interno', cambiado_en: futuro(0) },
      ],
    });
    const res = await request(app).get(`/api/v1/postulaciones/${POSTULACION_ID}/historial`).set(BENEFICIARIO);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain('func-9');
    expect(JSON.stringify(res.body)).not.toContain('actor_id');
  });

  it('GET /:id/validacion lista campos faltantes por seccion y declaraciones pendientes', async () => {
    escenarioBase();
    const res = await request(app).get(`/api/v1/postulaciones/${POSTULACION_ID}/validacion`).set(BENEFICIARIO);
    expect(res.status).toBe(200);
    expect(res.body.completo).toBe(false);
    expect(res.body.secciones_aplicables).toEqual(['seccion_1', 'seccion_2', 'seccion_3', 'seccion_4', 'seccion_5', 'seccion_7', 'seccion_9']);
    expect(res.body.declaraciones.pendientes).toHaveLength(6);
    expect(res.body.documentos).toEqual({ pendiente_modulo: true });
    expect(res.body.formatos).toEqual({ pendiente_modulo: true });
  });
});
