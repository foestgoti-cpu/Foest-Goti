import request from 'supertest';

/* ---------- Mocks de infraestructura (sin credenciales reales) ---------- */

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockTablas: Record<string, { data: unknown; error: unknown }> = {};

jest.mock('../../../config/env', () => {
  const real = jest.requireActual('../../../config/env');
  return { ...real, hasSupabaseCredentials: () => true };
});

jest.mock('../../../shared/supabase', () => ({
  supabaseAdmin: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (tabla: string) => {
      const cadena = {
        select: () => cadena,
        eq: () => cadena,
        maybeSingle: () => Promise.resolve(mockTablas[tabla] ?? { data: null, error: null }),
      };
      return cadena;
    },
  },
  supabaseAsUser: jest.fn(),
  getSupabaseAdmin: jest.fn(),
  __setSupabaseAdminForTests: jest.fn(),
}));

import { createApp } from '../../../app';
import { limpiarCacheDashboard } from '../dashboard_funcionario.service';

const BASE = '/api/v1/dashboard/funcionario';
const FUNC_ID = '11111111-1111-4111-8111-111111111111';
const CONV_A = '22222222-2222-4222-8222-222222222222';
const CONV_B = '33333333-3333-4333-8333-333333333333';

function conUsuario(rol: 'FUNCIONARIO' | 'BENEFICIARIO' | 'ADMINISTRADOR', activo = true) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FUNC_ID, email: 'qa@foest.test', app_metadata: { rol } } },
    error: null,
  });
  mockTablas.usuario = { data: { id: FUNC_ID, email: 'qa@foest.test', rol, activo }, error: null };
}

function agregados(parcial: Record<string, unknown> = {}) {
  return {
    alcance_invalido: false,
    convocatorias: [CONV_A],
    resumen: [
      { estado: 'PENDIENTE', total: 4 },
      { estado: 'EN_EVALUACION', total: 3 },
      { estado: 'APROBADA', total: 10 },
      { estado: 'RECHAZADA', total: 2 },
    ],
    por_beneficio: [
      { clave: 'S11', total: 20 },
      { clave: 'SUP', total: 5 },
      { clave: 'ST', total: 3 },
    ],
    por_tipo_solicitud: [
      { clave: 'PRIMERA_VEZ', total: 15 },
      { clave: 'RENOVACION', total: 4 },
    ],
    serie: [
      { dia: '2026-03-02', total: 2 },
      { dia: '2026-03-04', total: 5 },
    ],
    tiempos: { n: 12, promedio_horas: 30.5, p90_horas: 72.25 },
    carga: { propia: { activas: 3, dictaminadas_periodo: 7 }, comite: { activas: 9, dictaminadas_periodo: 21 }, miembros_comite: 3 },
    datos_actualizados_en: '2026-03-05T14:05:00.000Z',
    ...parcial,
  };
}

describe('dashboard_funcionario', () => {
  const app = createApp();

  beforeEach(() => {
    limpiarCacheDashboard();
    mockTablas.configuracion_sistema = { data: { valor: '5' }, error: null };
    mockRpc.mockReset();
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_metricas_funcionario') return { data: agregados(), error: null };
      if (fn === 'fn_convocatorias_funcionario') {
        return { data: [{ id: CONV_A, nombre: 'Convocatoria 2026-1', anio: 2026, semestre: 1, estado: 'HABILITADA' }], error: null };
      }
      return { data: null, error: { message: `rpc desconocida ${fn}` } };
    });
  });

  it('401 sin token', async () => {
    const res = await request(app).get(`${BASE}/resumen`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_AUTENTICADO');
  });

  it('403 para BENEFICIARIO (rol sin permiso dashboard:funcionario)', async () => {
    conUsuario('BENEFICIARIO');
    const res = await request(app).get(`${BASE}/resumen`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SIN_PERMISO');
  });

  it('403 para ADMINISTRADOR (el panel gerencial es otro modulo)', async () => {
    conUsuario('ADMINISTRADOR');
    const res = await request(app).get(`${BASE}/por-beneficio`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('404 cuando convocatoria_id no pertenece al comite (recurso ajeno)', async () => {
    conUsuario('FUNCIONARIO');
    mockRpc.mockResolvedValueOnce({ data: { alcance_invalido: true, convocatorias: [], datos_actualizados_en: null }, error: null });
    const res = await request(app).get(`${BASE}/resumen`).query({ convocatoria_id: CONV_B }).set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_ENCONTRADO');
  });

  it('422 con filtros invalidos (fecha mal formada, rango invertido, parametro extra)', async () => {
    conUsuario('FUNCIONARIO');
    const r1 = await request(app).get(`${BASE}/resumen`).query({ desde: '2026/01/01' }).set('Authorization', 'Bearer t');
    expect(r1.status).toBe(422);
    const r2 = await request(app).get(`${BASE}/resumen`).query({ desde: '2026-03-10', hasta: '2026-03-01' }).set('Authorization', 'Bearer t');
    expect(r2.status).toBe(422);
    const r3 = await request(app).get(`${BASE}/resumen`).query({ beneficio: 'SUP' }).set('Authorization', 'Bearer t');
    expect(r3.status).toBe(422);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('resumen: totales por estado, suma de asignadas y sello de actualizacion', async () => {
    conUsuario('FUNCIONARIO');
    const res = await request(app).get(`${BASE}/resumen`).query({ convocatoria_id: CONV_A }).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      datos_actualizados_en: '2026-03-05T14:05:00.000Z',
      convocatorias: [CONV_A],
      totales: { asignadas: 19, pendientes: 4, en_evaluacion: 3, en_correccion: 0, aprobadas: 10, rechazadas: 2, desistidas: 0 },
    });
    expect(mockRpc).toHaveBeenCalledWith('fn_metricas_funcionario', {
      p_funcionario: FUNC_ID,
      p_convocatoria: CONV_A,
      p_desde: null,
      p_hasta: null,
    });
  });

  it('funcionario sin comite: 200 con ceros, listas vacias y nulos (nunca 500)', async () => {
    conUsuario('FUNCIONARIO');
    mockRpc.mockImplementation(async () => ({
      data: { alcance_invalido: false, convocatorias: [], datos_actualizados_en: null },
      error: null,
    }));
    const auth = 'Bearer t';
    const resumen = await request(app).get(`${BASE}/resumen`).set('Authorization', auth);
    expect(resumen.status).toBe(200);
    expect(resumen.body.totales).toEqual({ asignadas: 0, pendientes: 0, en_evaluacion: 0, en_correccion: 0, aprobadas: 0, rechazadas: 0, desistidas: 0 });

    const benef = await request(app).get(`${BASE}/por-beneficio`).set('Authorization', auth);
    expect(benef.status).toBe(200);
    expect(benef.body).toMatchObject({ items: [], suprimido: false });

    const serie = await request(app).get(`${BASE}/serie-temporal`).set('Authorization', auth);
    expect(serie.status).toBe(200);
    expect(serie.body.items).toEqual([]);

    const tiempos = await request(app).get(`${BASE}/tiempos-revision`).set('Authorization', auth);
    expect(tiempos.status).toBe(200);
    expect(tiempos.body).toMatchObject({ n: 0, promedio_horas: null, p90_horas: null, sin_datos: true, suprimido: false });

    const carga = await request(app).get(`${BASE}/carga`).set('Authorization', auth);
    expect(carga.status).toBe(200);
    expect(carga.body).toEqual({
      datos_actualizados_en: null,
      propia: { activas: 0, dictaminadas_periodo: 0 },
      promedio_comite: null,
      miembros_comite: 0,
    });
  });

  it('por-beneficio: la celda de 3 se agrupa y la supresion complementaria oculta la celda de 5 que la haria deducible', async () => {
    conUsuario('FUNCIONARIO');
    const res = await request(app).get(`${BASE}/por-beneficio`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.suprimido).toBe(false);
    expect(res.body.umbral).toBe(5);
    expect(res.body.celdas_agrupadas).toBe(2);
    expect(res.body.items).toEqual([
      { clave: 'S11', etiqueta: 'Saber 11', total: 20, agrupado: false },
      { clave: 'Otros / Casos aislados', etiqueta: 'Otros / Casos aislados', total: 8, agrupado: true },
    ]);
  });

  it('por-tipo-solicitud: usa el umbral de CONFIG.KANON_UMBRAL', async () => {
    conUsuario('FUNCIONARIO');
    mockTablas.configuracion_sistema = { data: { valor: '3' }, error: null };
    const res = await request(app).get(`${BASE}/por-tipo-solicitud`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.umbral).toBe(3);
    // 15 y 4 superan el umbral 3: nada se agrupa
    expect(res.body.items).toEqual([
      { clave: 'PRIMERA_VEZ', etiqueta: 'Primera vez', total: 15, agrupado: false },
      { clave: 'RENOVACION', etiqueta: 'Renovacion', total: 4, agrupado: false },
    ]);
  });

  it('serie-temporal: rango inclusivo relleno con ceros en los dias sin envios', async () => {
    conUsuario('FUNCIONARIO');
    const res = await request(app)
      .get(`${BASE}/serie-temporal`)
      .query({ desde: '2026-03-01', hasta: '2026-03-04' })
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { dia: '2026-03-01', total: 0 },
      { dia: '2026-03-02', total: 2 },
      { dia: '2026-03-03', total: 0 },
      { dia: '2026-03-04', total: 5 },
    ]);
    expect(mockRpc).toHaveBeenCalledWith('fn_metricas_funcionario', expect.objectContaining({ p_desde: '2026-03-01', p_hasta: '2026-03-04' }));
  });

  it('tiempos-revision: promedio y p90 en horas; con muestra menor al umbral se publican nulos', async () => {
    conUsuario('FUNCIONARIO');
    const ok = await request(app).get(`${BASE}/tiempos-revision`).set('Authorization', 'Bearer t');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ n: 12, promedio_horas: 30.5, p90_horas: 72.25, sin_datos: false, suprimido: false });

    limpiarCacheDashboard();
    mockRpc.mockImplementation(async () => ({ data: agregados({ tiempos: { n: 2, promedio_horas: 10, p90_horas: 12 } }), error: null }));
    const pocos = await request(app).get(`${BASE}/tiempos-revision`).set('Authorization', 'Bearer t');
    expect(pocos.body).toMatchObject({ n: 2, promedio_horas: null, p90_horas: null, sin_datos: false, suprimido: true });
  });

  it('carga: propia vs promedio del comite; con menos de 3 miembros el promedio se omite', async () => {
    conUsuario('FUNCIONARIO');
    const res = await request(app).get(`${BASE}/carga`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      datos_actualizados_en: '2026-03-05T14:05:00.000Z',
      propia: { activas: 3, dictaminadas_periodo: 7 },
      promedio_comite: { activas: 3, dictaminadas_periodo: 7 },
      miembros_comite: 3,
    });

    limpiarCacheDashboard();
    mockRpc.mockImplementation(async () => ({
      data: agregados({ carga: { propia: { activas: 3, dictaminadas_periodo: 7 }, comite: { activas: 5, dictaminadas_periodo: 9 }, miembros_comite: 2 } }),
      error: null,
    }));
    const dos = await request(app).get(`${BASE}/carga`).set('Authorization', 'Bearer t');
    expect(dos.body.promedio_comite).toBeNull();
    expect(dos.body.miembros_comite).toBe(2);
    expect(JSON.stringify(dos.body)).not.toContain('funcionario_id');
  });

  it('cache de 60 s: la segunda llamada identica no vuelve a consultar la base', async () => {
    conUsuario('FUNCIONARIO');
    await request(app).get(`${BASE}/resumen`).query({ convocatoria_id: CONV_A }).set('Authorization', 'Bearer t');
    await request(app).get(`${BASE}/carga`).query({ convocatoria_id: CONV_A }).set('Authorization', 'Bearer t');
    const llamadasMetricas = mockRpc.mock.calls.filter((c) => c[0] === 'fn_metricas_funcionario');
    expect(llamadasMetricas).toHaveLength(1);
    // Filtros distintos -> nueva consulta
    await request(app).get(`${BASE}/resumen`).query({ convocatoria_id: CONV_A, desde: '2026-01-01' }).set('Authorization', 'Bearer t');
    expect(mockRpc.mock.calls.filter((c) => c[0] === 'fn_metricas_funcionario')).toHaveLength(2);
  });

  it('convocatorias: lista las del comite para el filtro', async () => {
    conUsuario('FUNCIONARIO');
    const res = await request(app).get(`${BASE}/convocatorias`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([{ id: CONV_A, nombre: 'Convocatoria 2026-1', anio: 2026, semestre: 1, estado: 'HABILITADA' }]);
  });

  it('no existe /exportar (la exportacion es exclusiva de export_reports)', async () => {
    conUsuario('FUNCIONARIO');
    const res = await request(app).get(`${BASE}/exportar`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('RUTA_NO_ENCONTRADA');
  });

  it('fallo de la RPC -> 500 controlado con el cuerpo estandar', async () => {
    conUsuario('FUNCIONARIO');
    mockRpc.mockImplementation(async () => ({ data: null, error: { message: 'boom' } }));
    const res = await request(app).get(`${BASE}/resumen`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'ERROR_INTERNO', message: expect.any(String) });
  });
});
