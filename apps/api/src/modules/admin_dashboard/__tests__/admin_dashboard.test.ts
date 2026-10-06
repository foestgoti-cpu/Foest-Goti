import request from 'supertest';
import { FakeSupabase } from './fake-supabase';

const fake = new FakeSupabase();

jest.mock('../../../config/env', () => {
  const real = jest.requireActual('../../../config/env');
  return { ...real, hasSupabaseCredentials: () => true };
});
jest.mock('../../../shared/supabase', () => ({
  supabaseAdmin: fake,
  supabaseAsUser: () => fake,
  getSupabaseAdmin: () => fake,
  __setSupabaseAdminForTests: () => undefined,
}));

// Importar despues de los mocks
import { createApp } from '../../../app';
import { invalidarCache } from '../cache';
import { configuracionService } from '../../catalogos_configuracion/configuracion.service';
import { aplicarKAnonimato } from '../admin_dashboard.service';
import { CODIGOS_ALERTA } from '../admin_dashboard.types';

const ADMIN = 'tok-admin';
const FUNC = 'tok-func';
const BENEF = 'tok-benef';
fake.usuarios.set(ADMIN, { id: '11111111-1111-4111-8111-111111111111', email: 'admin@foest.test', rol: 'ADMINISTRADOR' });
fake.usuarios.set(FUNC, { id: '22222222-2222-4222-8222-222222222222', email: 'func@foest.test', rol: 'FUNCIONARIO' });
fake.usuarios.set(BENEF, { id: '33333333-3333-4333-8333-333333333333', email: 'benef@foest.test', rol: 'BENEFICIARIO' });

const app = createApp();
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

function alertaCierre(diasRestantes: number) {
  return {
    codigo: 'CIERRE_PROXIMO',
    severidad: diasRestantes <= 2 ? 'ALTA' : 'MEDIA',
    entidad: 'CONVOCATORIA',
    entidad_id: 'c1',
    mensaje: `La convocatoria 2026-2 cierra en ${diasRestantes} dia(s)`,
    detalle: { dias_restantes: diasRestantes },
    accion_url: '/admin/convocatorias/c1',
  };
}

/** Simula el detector CIERRE_PROXIMO de fn_admin_alertas con el umbral ALERTA_CIERRE_DIAS. */
function instalarAlertas(diasAlCierre: number, umbralCierre: number) {
  fake.rpcs.set('fn_admin_alertas', () => ({
    data: {
      generado_en: new Date().toISOString(),
      total: diasAlCierre < umbralCierre ? 1 : 0,
      alertas: diasAlCierre < umbralCierre ? [alertaCierre(diasAlCierre)] : [],
      detectores_con_error: [],
      umbrales: { ALERTA_CIERRE_DIAS: umbralCierre },
    },
    error: null,
  }));
}

beforeEach(() => {
  invalidarCache();
  configuracionService.__limpiarCacheParaPruebas();
  fake.reiniciarRegistro();
});

describe('acceso (DECISIONES section 2)', () => {
  const rutas = [
    '/api/v1/dashboard/admin/resumen',
    '/api/v1/dashboard/admin/alertas',
    '/api/v1/dashboard/admin/convocatorias',
    '/api/v1/dashboard/admin/metricas/periodo?a=2026-1&b=2025-2',
    '/api/v1/dashboard/admin/carga-evaluadores',
    '/api/v1/auditoria',
    '/api/v1/auditoria/catalogo',
    '/api/v1/configuracion',
  ];

  it.each(rutas)('401 sin token en %s', async (ruta) => {
    const res = await request(app).get(ruta);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_AUTENTICADO');
  });

  it.each(rutas)('403 para FUNCIONARIO en %s', async (ruta) => {
    const res = await request(app).get(ruta).set(bearer(FUNC));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SIN_PERMISO');
  });

  it.each(rutas)('403 para BENEFICIARIO en %s', async (ruta) => {
    const res = await request(app).get(ruta).set(bearer(BENEF));
    expect(res.status).toBe(403);
  });

  it('403 para FUNCIONARIO en PUT /configuracion y POST /festivos; 200 en GET /festivos (lectura para todos)', async () => {
    const put = await request(app).put('/api/v1/configuracion/ALERTA_CIERRE_DIAS').set(bearer(FUNC)).send({ valor: 5, version: 0 });
    expect(put.status).toBe(403);
    const post = await request(app).post('/api/v1/festivos').set(bearer(FUNC)).send({ fecha: '2027-01-01', nombre: 'Ano Nuevo' });
    expect(post.status).toBe(403);
    fake.tablas.set('festivo', () => ({ data: [{ id: 'f1', fecha: '2026-01-01', nombre: 'Ano Nuevo', anio: 2026 }], error: null }));
    const get = await request(app).get('/api/v1/festivos?anio=2026').set(bearer(FUNC));
    expect(get.status).toBe(200);
    expect(get.body.data).toHaveLength(1);
  });
});

describe('GET /dashboard/admin/resumen', () => {
  it('devuelve los conteos y montos pendiente_modulo; la segunda lectura sale de cache (60 s)', async () => {
    fake.rpcs.set('fn_admin_resumen', () => ({
      data: {
        generado_en: '2026-10-06T15:00:00Z',
        usuarios: [{ rol: 'ADMINISTRADOR', activos: 1, inactivos: 0 }],
        convocatorias: [{ estado: 'HABILITADA', total: 1 }],
        postulaciones: [{ estado: 'PENDIENTE', total: 4 }],
        festivos_anio_siguiente_cargados: false,
        montos: { estado: 'pendiente_modulo' },
      },
      error: null,
    }));
    const r1 = await request(app).get('/api/v1/dashboard/admin/resumen').set(bearer(ADMIN));
    expect(r1.status).toBe(200);
    expect(r1.body.montos.estado).toBe('pendiente_modulo');
    expect(r1.body.desde_cache).toBe(false);
    const r2 = await request(app).get('/api/v1/dashboard/admin/resumen').set(bearer(ADMIN));
    expect(r2.body.desde_cache).toBe(true);
    expect(fake.llamadasRpc.filter((l) => l.fn === 'fn_admin_resumen')).toHaveLength(1);
  });
});

describe('GET /dashboard/admin/alertas', () => {
  it('CIERRE_PROXIMO aparece cuando faltan menos de ALERTA_CIERRE_DIAS dias y no aparece si faltan mas', async () => {
    instalarAlertas(3, 7);
    const con = await request(app).get('/api/v1/dashboard/admin/alertas').set(bearer(ADMIN));
    expect(con.status).toBe(200);
    expect(con.body.alertas).toHaveLength(1);
    expect(con.body.alertas[0]).toMatchObject({ codigo: 'CIERRE_PROXIMO', entidad: 'CONVOCATORIA', detalle: { dias_restantes: 3 } });
    expect(con.body.umbrales.ALERTA_CIERRE_DIAS).toBe(7);

    invalidarCache();
    instalarAlertas(10, 7);
    const sin = await request(app).get('/api/v1/dashboard/admin/alertas').set(bearer(ADMIN));
    expect(sin.body.alertas).toHaveLength(0);

    // Al subir el umbral a 15 (configuracion), la misma convocatoria vuelve a alertar tras la cache
    invalidarCache();
    instalarAlertas(10, 15);
    const otraVez = await request(app).get('/api/v1/dashboard/admin/alertas').set(bearer(ADMIN));
    expect(otraVez.body.alertas).toHaveLength(1);
  });

  it('filtra por codigo y severidad, y rechaza codigos fuera del catalogo (422)', async () => {
    instalarAlertas(1, 7);
    const ok = await request(app).get('/api/v1/dashboard/admin/alertas?codigo=CIERRE_PROXIMO&severidad=ALTA').set(bearer(ADMIN));
    expect(ok.body.total).toBe(1);
    const vacio = await request(app).get('/api/v1/dashboard/admin/alertas?codigo=SIN_COMITE').set(bearer(ADMIN));
    expect(vacio.body.total).toBe(0);
    const invalido = await request(app).get('/api/v1/dashboard/admin/alertas?codigo=NO_EXISTE').set(bearer(ADMIN));
    expect(invalido.status).toBe(422);
  });

  it('el catalogo de codigos contiene todas las alertas de admin_dashboard.md', () => {
    expect([...CODIGOS_ALERTA].sort()).toEqual(
      ['CIERRE_PROXIMO', 'SIN_COMITE', 'SOBRECARGA', 'POOL_SIN_TOMAR', 'SUBSANACION_POR_VENCER', 'CUPOS_SUPERADOS', 'FUNCIONARIO_INACTIVO_CON_ASIGNACIONES', 'TRABAJO_FALLIDO'].sort(),
    );
  });
});

describe('GET /dashboard/admin/metricas/periodo', () => {
  it('422 sin a/b; con ambos aplica k-anonimato a los desgloses', async () => {
    const sinParams = await request(app).get('/api/v1/dashboard/admin/metricas/periodo').set(bearer(ADMIN));
    expect(sinParams.status).toBe(422);

    fake.tablas.set('configuracion_sistema', () => ({ data: { valor: '5' }, error: null }));
    fake.rpcs.set('fn_admin_metricas_periodo', (args) => ({
      data: {
        periodo: `${args.p_anio}-${args.p_semestre}`,
        existe: true,
        postulaciones_por_estado: { APROBADA: 20 },
        postulaciones_por_tipo: { PRIMERA_VEZ: 18, RENOVACION: 2 },
        postulaciones_por_beneficio: { SUP: 12, ST: 6, DEP: 2 },
        montos: { estado: 'pendiente_modulo' },
      },
      error: null,
    }));
    const res = await request(app).get('/api/v1/dashboard/admin/metricas/periodo?a=2026-1&b=2025-2').set(bearer(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.kanon_umbral).toBe(5);
    // RENOVACION (2) < 5 -> OTROS; por supresion complementaria se pliega tambien PRIMERA_VEZ
    expect(res.body.a.postulaciones_por_tipo).toEqual({ OTROS: 20 });
    // DEP (2) -> OTROS; se pliega ST (la menor restante): queda SUP y OTROS
    expect(res.body.b.postulaciones_por_beneficio).toEqual({ SUP: 12, OTROS: 8 });
  });

  it('aplicarKAnonimato conserva celdas >= k cuando hay al menos dos pequenas', () => {
    expect(aplicarKAnonimato({ A: 10, B: 2, C: 3, D: 7 }, 5)).toEqual({ A: 10, D: 7, OTROS: 5 });
    expect(aplicarKAnonimato({}, 5)).toEqual({});
  });
});

describe('GET /dashboard/admin/carga-evaluadores', () => {
  it('devuelve la carga nominal solo al administrador', async () => {
    fake.rpcs.set('fn_admin_carga_evaluadores', (args) => ({
      data: { generado_en: 'x', periodo: args.p_anio ? `${args.p_anio}-${args.p_semestre}` : null, evaluadores: [{ funcionario_id: 'f', nombre: 'Ana Perez', activo: true, en_evaluacion: 3, dictaminadas_periodo: 9 }] },
      error: null,
    }));
    const res = await request(app).get('/api/v1/dashboard/admin/carga-evaluadores?periodo=2026-1').set(bearer(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.periodo).toBe('2026-1');
    expect(res.body.evaluadores[0].nombre).toBe('Ana Perez');
    const func = await request(app).get('/api/v1/dashboard/admin/carga-evaluadores').set(bearer(FUNC));
    expect(func.status).toBe(403);
  });
});

describe('PUT /configuracion/:clave', () => {
  const fila = {
    clave: 'ALERTA_CIERRE_DIAS',
    valor: '7',
    tipo: 'INT',
    categoria: 'ALERTAS',
    descripcion: 'd',
    valor_defecto: '7',
    valor_min: '1',
    valor_max: '30',
    pendiente_confirmar: false,
    version: 3,
    actualizado_por: null,
    actualizado_en: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    fake.tablas.set('configuracion_sistema', (op) => {
      if (op.tipo === 'update') {
        const versionFiltro = op.filtros.find((f) => f.columna === 'version')?.valor;
        if (versionFiltro !== fila.version) return { data: null, error: null };
        return { data: { ...fila, ...(op.cuerpo as object) }, error: null };
      }
      return { data: fila, error: null };
    });
  });

  it('409 VERSION_DESACTUALIZADA con version vieja', async () => {
    const res = await request(app).put('/api/v1/configuracion/ALERTA_CIERRE_DIAS').set(bearer(ADMIN)).send({ valor: 10, version: 2 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VERSION_DESACTUALIZADA');
    expect(res.body.details.version_actual).toBe(3);
  });

  it('422 VALOR_FUERA_DE_RANGO y 422 VALOR_INVALIDO segun tipo', async () => {
    const fuera = await request(app).put('/api/v1/configuracion/ALERTA_CIERRE_DIAS').set(bearer(ADMIN)).send({ valor: 99, version: 3 });
    expect(fuera.status).toBe(422);
    expect(fuera.body.code).toBe('VALOR_FUERA_DE_RANGO');
    const texto = await request(app).put('/api/v1/configuracion/ALERTA_CIERRE_DIAS').set(bearer(ADMIN)).send({ valor: 'abc', version: 3 });
    expect(texto.status).toBe(422);
    expect(texto.body.code).toBe('VALOR_INVALIDO');
  });

  it('caso feliz: incrementa version, audita CONFIGURACION e invalida la cache del dashboard', async () => {
    const res = await request(app).put('/api/v1/configuracion/ALERTA_CIERRE_DIAS').set(bearer(ADMIN)).send({ valor: 10, version: 3, motivo: 'Ajuste operativo' });
    expect(res.status).toBe(200);
    expect(res.body.valor).toBe('10');
    expect(res.body.version).toBe(4);
    const auditoria = fake.operaciones.find((o) => o.tabla === 'auditoria_evento' && o.tipo === 'insert');
    expect(auditoria).toBeDefined();
    expect(auditoria?.cuerpo).toMatchObject({ accion: 'CONFIGURACION', entidad: 'CONFIGURACION', entidad_id: 'ALERTA_CIERRE_DIAS', datos_antes: { valor: '7' }, datos_despues: { valor: '10' } });
  });

  it('422 CONFIRMACION_REQUERIDA en categorias criticas sin confirmar: true', async () => {
    fake.tablas.set('configuracion_sistema', () => ({ data: { ...fila, clave: 'SESIONES_MAX', categoria: 'SEGURIDAD', valor_max: '10' }, error: null }));
    const res = await request(app).put('/api/v1/configuracion/SESIONES_MAX').set(bearer(ADMIN)).send({ valor: 5, version: 3 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CONFIRMACION_REQUERIDA');
  });

  it('404 para una clave inexistente', async () => {
    fake.tablas.set('configuracion_sistema', () => ({ data: null, error: null }));
    const res = await request(app).put('/api/v1/configuracion/NO_EXISTE').set(bearer(ADMIN)).send({ valor: 1, version: 0 });
    expect(res.status).toBe(404);
  });
});

describe('festivos', () => {
  it('POST crea y audita; 409 FESTIVO_DUPLICADO; DELETE 404 si no existe', async () => {
    fake.tablas.set('festivo', (op) => {
      if (op.tipo === 'insert') {
        const c = op.cuerpo as { fecha: string };
        if (c.fecha === '2026-01-01') return { data: null, error: { message: 'dup', code: '23505' } };
        return { data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ...c, creado_en: 'x' }, error: null };
      }
      if (op.tipo === 'select' && op.single) return { data: null, error: null };
      return { data: [], error: null };
    });
    const ok = await request(app).post('/api/v1/festivos').set(bearer(ADMIN)).send({ fecha: '2027-01-01', nombre: 'Ano Nuevo' });
    expect(ok.status).toBe(201);
    expect(ok.body.anio).toBe(2027);
    expect(fake.operaciones.some((o) => o.tabla === 'auditoria_evento' && (o.cuerpo as { accion: string }).accion === 'CREAR')).toBe(true);
    const dup = await request(app).post('/api/v1/festivos').set(bearer(ADMIN)).send({ fecha: '2026-01-01', nombre: 'Ano Nuevo' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('FESTIVO_DUPLICADO');
    const del = await request(app).delete('/api/v1/festivos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').set(bearer(ADMIN));
    expect(del.status).toBe(404);
    const invalido = await request(app).post('/api/v1/festivos').set(bearer(ADMIN)).send({ fecha: '01/01/2027', nombre: 'x' });
    expect(invalido.status).toBe(422);
  });
});

describe('auditoria', () => {
  it('lista paginada; filtrar por actor audita LECTURA_SENSIBLE una sola vez; rango > 366 dias 422', async () => {
    fake.tablas.set('auditoria_evento', (op) => {
      if (op.tipo === 'insert') return { data: { id: 'evt-nuevo' }, error: null };
      return { data: [{ id: 'e1', accion: 'CONFIGURACION', entidad: 'CONFIGURACION', registrado_en: 'x' }], error: null, count: 1 };
    });
    const simple = await request(app).get('/api/v1/auditoria?entidad=CONFIGURACION&page=1&page_size=10').set(bearer(ADMIN));
    expect(simple.status).toBe(200);
    expect(simple.body).toMatchObject({ page: 1, page_size: 10, total: 1 });
    expect(fake.operaciones.filter((o) => o.tabla === 'auditoria_evento' && o.tipo === 'insert')).toHaveLength(0);

    fake.reiniciarRegistro();
    const porActor = await request(app).get('/api/v1/auditoria?actor_id=11111111-1111-4111-8111-111111111111').set(bearer(ADMIN));
    expect(porActor.status).toBe(200);
    const inserciones = fake.operaciones.filter((o) => o.tabla === 'auditoria_evento' && o.tipo === 'insert');
    expect(inserciones).toHaveLength(1);
    expect(inserciones[0]?.cuerpo).toMatchObject({ accion: 'LECTURA_SENSIBLE', entidad: 'AUDITORIA' });

    const rango = await request(app).get('/api/v1/auditoria?desde=2024-01-01&hasta=2026-01-05').set(bearer(ADMIN));
    expect(rango.status).toBe(422);
    expect(rango.body.code).toBe('RANGO_EXCESIVO');
  });

  it('detalle audita LECTURA_SENSIBLE; 404 si no existe; catalogo y linea de tiempo responden', async () => {
    fake.tablas.set('auditoria_evento', (op) => {
      if (op.tipo === 'insert') return { data: { id: 'evt-nuevo' }, error: null };
      if (op.single) {
        const id = op.filtros.find((f) => f.columna === 'id')?.valor;
        return id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' ? { data: { id, accion: 'CREAR', entidad: 'FESTIVO', actor_id: 'u' }, error: null } : { data: null, error: null };
      }
      return { data: [{ id: 'e1' }], error: null, count: 1 };
    });
    const ok = await request(app).get('/api/v1/auditoria/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').set(bearer(ADMIN));
    expect(ok.status).toBe(200);
    expect(fake.operaciones.filter((o) => o.tabla === 'auditoria_evento' && o.tipo === 'insert')).toHaveLength(1);
    const no = await request(app).get('/api/v1/auditoria/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb').set(bearer(ADMIN));
    expect(no.status).toBe(404);
    const cat = await request(app).get('/api/v1/auditoria/catalogo').set(bearer(ADMIN));
    expect(cat.body.acciones).toContain('LECTURA_SENSIBLE');
    const linea = await request(app).get('/api/v1/auditoria/entidad/FESTIVO/f1').set(bearer(ADMIN));
    expect(linea.status).toBe(200);
    expect(linea.body.total).toBe(1);
    const entidadInvalida = await request(app).get('/api/v1/auditoria/entidad/NO_EXISTE/f1').set(bearer(ADMIN));
    expect(entidadInvalida.status).toBe(422);
  });
});
