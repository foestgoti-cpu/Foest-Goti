import request from 'supertest';
import { crearFakeSupabase, type FakeSupabase, type Tablas } from './fake-supabase';
import { contieneCamposActor } from '../observacion.publica';

/* ------------------------- Mocks de infraestructura ------------------------- */

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

/* --------------------------------- Datos ---------------------------------- */

const DIA = 24 * 60 * 60 * 1000;
const ahora = new Date();
const iso = (deltaDias: number) => new Date(ahora.getTime() + deltaDias * DIA).toISOString();

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const B2 = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const C_OPEN = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';
const C_OLD = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const P1 = 'e1e1e1e1-0000-4000-8000-000000000001';
const P2 = 'e2e2e2e2-0000-4000-8000-000000000002';
const P3 = 'e3e3e3e3-0000-4000-8000-000000000003';
const N1 = 'a1a1a1a1-0000-4000-8000-000000000001';
const N2 = 'a2a2a2a2-0000-4000-8000-000000000002';
const N3 = 'a3a3a3a3-0000-4000-8000-000000000003';
const FUNC = 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0';

const TOK = { benef: 'tok-benef', otro: 'tok-otro', admin: 'tok-admin', func: 'tok-func' };

function datos(): Tablas {
  return {
    beneficiario: [
      { id: B1, usuario_id: U1, nombres: 'Laura Maria', apellidos: 'Perez', perfil_completo: true, es_menor: false },
      { id: B2, usuario_id: U2, nombres: 'Otro', apellidos: 'Usuario', perfil_completo: true, es_menor: false },
    ],
    convocatoria: [
      {
        id: C_OPEN,
        anio: 2026,
        semestre: 1,
        nombre: 'Convocatoria 2026-1',
        descripcion: 'Apoyos educativos',
        fecha_apertura: iso(-10),
        fecha_cierre_exclusiva: iso(3),
        estado: 'HABILITADA',
      },
      {
        id: C_OLD,
        anio: 2025,
        semestre: 2,
        nombre: 'Convocatoria 2025-2',
        descripcion: '',
        fecha_apertura: iso(-200),
        fecha_cierre_exclusiva: iso(-150),
        estado: 'CERRADA',
      },
    ],
    postulacion: [
      {
        id: P1,
        beneficiario_id: B1,
        convocatoria_id: C_OPEN,
        tipo_solicitud: 'PRIMERA_VEZ',
        estado: 'BORRADOR',
        ciclo: 0,
        version: 0,
        aprobacion_parcial: false,
        fecha_limite_subsanacion: null,
        enviada_en: null,
        correccion_vigente: null,
        creado_en: iso(-2),
        actualizado_en: iso(-2),
      },
      {
        id: P2,
        beneficiario_id: B1,
        convocatoria_id: C_OLD,
        tipo_solicitud: 'PRIMERA_VEZ',
        estado: 'EN_CORRECCION',
        ciclo: 1,
        version: 4,
        aprobacion_parcial: false,
        fecha_limite_subsanacion: iso(4),
        enviada_en: iso(-180),
        correccion_vigente: {
          observaciones: 'Falta el certificado del SISBEN actualizado y el telefono no coincide.',
          campos_observados: ['datos.telefono'],
          documentos_observados: ['Certificado SISBEN'],
          funcionario_id: FUNC,
        },
        creado_en: iso(-190),
        actualizado_en: iso(-1),
      },
      {
        id: P3,
        beneficiario_id: B2,
        convocatoria_id: C_OPEN,
        tipo_solicitud: 'PRIMERA_VEZ',
        estado: 'PENDIENTE',
        ciclo: 1,
        version: 1,
        aprobacion_parcial: false,
        fecha_limite_subsanacion: null,
        enviada_en: iso(-1),
        correccion_vigente: null,
        creado_en: iso(-3),
        actualizado_en: iso(-1),
      },
    ],
    postulacion_envio: [{ id: 'e1', postulacion_id: P2, ciclo: 1, enviado_en: iso(-180) }],
    postulacion_beneficio: [{ postulacion_id: P2, beneficio_codigo: 'SUP' }],
    historial_estado_postulacion: [
      { id: 'h1', postulacion_id: P2, ciclo: 0, estado_anterior: null, estado_nuevo: 'BORRADOR', motivo: 'CREACION', actor_tipo: 'BENEFICIARIO', actor_id: U1, observaciones: null, cambiado_en: iso(-190) },
      { id: 'h2', postulacion_id: P2, ciclo: 1, estado_anterior: 'BORRADOR', estado_nuevo: 'PENDIENTE', motivo: 'ENVIO', actor_tipo: 'BENEFICIARIO', actor_id: U1, observaciones: null, cambiado_en: iso(-180) },
      { id: 'h3', postulacion_id: P2, ciclo: 1, estado_anterior: 'PENDIENTE', estado_nuevo: 'EN_EVALUACION', motivo: 'TOMA', actor_tipo: 'FUNCIONARIO', actor_id: FUNC, observaciones: null, cambiado_en: iso(-170) },
      { id: 'h4', postulacion_id: P2, ciclo: 1, estado_anterior: 'EN_EVALUACION', estado_nuevo: 'PENDIENTE', motivo: 'LIBERACION', actor_tipo: 'FUNCIONARIO', actor_id: FUNC, observaciones: 'liberada por carga', cambiado_en: iso(-160) },
      { id: 'h5', postulacion_id: P2, ciclo: 1, estado_anterior: 'PENDIENTE', estado_nuevo: 'EN_EVALUACION', motivo: 'TOMA', actor_tipo: 'FUNCIONARIO', actor_id: FUNC, observaciones: null, cambiado_en: iso(-150) },
      {
        id: 'h6',
        postulacion_id: P2,
        ciclo: 1,
        estado_anterior: 'EN_EVALUACION',
        estado_nuevo: 'EN_CORRECCION',
        motivo: 'DICTAMEN_CORRECCION',
        actor_tipo: 'FUNCIONARIO',
        actor_id: FUNC,
        observaciones: 'Falta el certificado del SISBEN actualizado y el telefono no coincide.',
        cambiado_en: iso(-1),
      },
    ],
    notificacion: [
      { id: N1, usuario_id: U1, tipo: 'CORRECCION_SOLICITADA', titulo: 'Correcciones solicitadas', mensaje: 'Revise su expediente', entidad: 'POSTULACION', entidad_id: P2, url_destino: `/beneficiario/postulaciones/${P2}`, severidad: 'CRITICA', leida: false, leida_en: null, creada_en: iso(-1) },
      { id: N2, usuario_id: U1, tipo: 'INFO', titulo: 'Bienvenida', mensaje: 'Bienvenido a FOEST', entidad: null, entidad_id: null, url_destino: null, severidad: 'INFO', leida: false, leida_en: null, creada_en: iso(-5) },
      { id: N3, usuario_id: U2, tipo: 'INFO', titulo: 'Ajena', mensaje: 'No debe verse', entidad: null, entidad_id: null, url_destino: null, severidad: 'INFO', leida: false, leida_en: null, creada_en: iso(-1) },
    ],
    configuracion_sistema: [
      { clave: 'RECORDATORIO_BORRADOR_DIAS', valor: '5' },
      { clave: 'FECHA_PROXIMA_APERTURA_ESTIMADA', valor: null },
    ],
    beneficio: [
      { codigo: 'SUP', nombre: 'Matricula Educacion Superior' },
      { codigo: 'ST', nombre: 'Subsidio de Transporte' },
    ],
  };
}

function prepararFake() {
  mockEstado.fake = crearFakeSupabase(datos(), {
    [TOK.benef]: { id: U1, email: 'laura@foest.test', rol: 'BENEFICIARIO' },
    [TOK.otro]: { id: U2, email: 'otro@foest.test', rol: 'BENEFICIARIO' },
    [TOK.admin]: { id: 'ad000000-0000-4000-8000-000000000000', email: 'admin@foest.test', rol: 'ADMINISTRADOR' },
    [TOK.func]: { id: FUNC, email: 'func@foest.test', rol: 'FUNCIONARIO' },
  });
  return mockEstado.fake;
}

const BASE = '/api/v1/dashboard/beneficiario';
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('beneficiario_dashboard', () => {
  const app = createApp();
  let fake: FakeSupabase;

  beforeEach(() => {
    fake = prepararFake();
  });

  describe('acceso (DECISIONES seccion 2)', () => {
    it('401 sin token en todas las rutas', async () => {
      for (const ruta of [`${BASE}/resumen`, `${BASE}/postulaciones/${P2}/linea-tiempo`, `${BASE}/postulaciones/${P2}/documentos`, `${BASE}/descargas`, `${BASE}/otorgamientos`]) {
        const res = await request(app).get(ruta);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('NO_AUTENTICADO');
      }
    });

    it('403 para ADMINISTRADOR y FUNCIONARIO (no tienen dashboard:beneficiario)', async () => {
      for (const t of [TOK.admin, TOK.func]) {
        const res = await request(app).get(`${BASE}/resumen`).set(auth(t));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SIN_PERMISO');
      }
    });

    it('404 en postulacion ajena, inexistente; 422 en id invalido', async () => {
      const ajena = await request(app).get(`${BASE}/postulaciones/${P3}/linea-tiempo`).set(auth(TOK.benef));
      expect(ajena.status).toBe(404);
      const ajenaDocs = await request(app).get(`${BASE}/postulaciones/${P3}/documentos`).set(auth(TOK.benef));
      expect(ajenaDocs.status).toBe(404);
      const inexistente = await request(app).get(`${BASE}/postulaciones/99999999-9999-4999-8999-999999999999/linea-tiempo`).set(auth(TOK.benef));
      expect(inexistente.status).toBe(404);
      const invalido = await request(app).get(`${BASE}/postulaciones/no-es-uuid/linea-tiempo`).set(auth(TOK.benef));
      expect(invalido.status).toBe(422);
    });
  });

  describe('GET /resumen', () => {
    it('devuelve convocatoria abierta, postulacion actual, acciones pendientes y contadores', async () => {
      const res = await request(app).get(`${BASE}/resumen`).set(auth(TOK.benef));
      expect(res.status).toBe(200);
      const b = res.body;
      expect(b.saludo).toMatchObject({ nombre: 'Laura', tiene_perfil: true, perfil_completo: true });
      expect(b.convocatoria_abierta).toMatchObject({ id: C_OPEN, nombre: 'Convocatoria 2026-1' });
      expect(b.puede_iniciar_postulacion).toBe(false); // ya tiene borrador en la abierta
      expect(b.postulacion_actual).toMatchObject({ id: P1, estado: 'BORRADOR', estado_texto: 'Borrador sin enviar' });
      expect(b.postulaciones).toHaveLength(2);
      const tipos = b.acciones_pendientes.map((a: { tipo: string }) => a.tipo);
      expect(tipos).toEqual(expect.arrayContaining(['BORRADOR_POR_VENCER', 'DOCUMENTOS_POR_CORREGIR', 'NOTIFICACION_CRITICA']));
      const correccion = b.acciones_pendientes.find((a: { tipo: string }) => a.tipo === 'DOCUMENTOS_POR_CORREGIR');
      expect(correccion.prioridad).toBe('ALTA');
      expect(correccion.descripcion).toContain('Certificado SISBEN');
      expect(correccion.descripcion).toContain('datos.telefono');
      expect(b.notificaciones).toEqual({ no_leidas: 2, criticas_no_leidas: 1 });
      expect(b.pendiente_modulo.otorgamientos).toBe(true);
      // Las acciones ALTA van primero
      expect(b.acciones_pendientes[0].prioridad).toBe('ALTA');
      expect(contieneCamposActor(b)).toEqual([]);
    });

    it('regla: un borrador cuya convocatoria cierra despues de RECORDATORIO_BORRADOR_DIAS no genera accion', async () => {
      const c = fake.tablas.convocatoria!.find((x) => x.id === C_OPEN)!;
      c.fecha_cierre_exclusiva = iso(12);
      const res = await request(app).get(`${BASE}/resumen`).set(auth(TOK.benef));
      expect(res.status).toBe(200);
      const tipos = res.body.acciones_pendientes.map((a: { tipo: string }) => a.tipo);
      expect(tipos).not.toContain('BORRADOR_POR_VENCER');
    });

    it('regla: una subsanacion vencida ya no aparece como accion pendiente', async () => {
      const p = fake.tablas.postulacion!.find((x) => x.id === P2)!;
      p.fecha_limite_subsanacion = iso(-1);
      const res = await request(app).get(`${BASE}/resumen`).set(auth(TOK.benef));
      const tipos = res.body.acciones_pendientes.map((a: { tipo: string }) => a.tipo);
      expect(tipos).not.toContain('DOCUMENTOS_POR_CORREGIR');
    });

    it('sin convocatoria abierta devuelve la fecha estimada de proxima apertura desde configuracion_sistema', async () => {
      const c = fake.tablas.convocatoria!.find((x) => x.id === C_OPEN)!;
      c.estado = 'CERRADA';
      c.fecha_cierre_exclusiva = iso(-1);
      fake.tablas.configuracion_sistema!.find((x) => x.clave === 'FECHA_PROXIMA_APERTURA_ESTIMADA')!.valor = '2026-08-01';
      const res = await request(app).get(`${BASE}/resumen`).set(auth(TOK.benef));
      expect(res.status).toBe(200);
      expect(res.body.convocatoria_abierta).toBeNull();
      expect(res.body.proxima_apertura_estimada).toBe('2026-08-01');
      expect(res.body.proxima_apertura_texto).toMatch(/2026/);
      expect(res.body.mensaje_convocatoria).toContain('proxima apertura');
      expect(res.body.puede_iniciar_postulacion).toBe(false);
    });

    it('sin convocatoria abierta ni fecha configurada usa la proxima convocatoria programada o un mensaje amigable', async () => {
      const c = fake.tablas.convocatoria!.find((x) => x.id === C_OPEN)!;
      c.estado = 'BORRADOR';
      c.fecha_apertura = iso(20);
      c.fecha_cierre_exclusiva = iso(40);
      const res = await request(app).get(`${BASE}/resumen`).set(auth(TOK.benef));
      expect(res.body.convocatoria_abierta).toBeNull();
      expect(res.body.proxima_apertura_estimada).toBe(c.fecha_apertura);

      fake.tablas.convocatoria = fake.tablas.convocatoria!.filter((x) => x.id !== C_OPEN);
      const res2 = await request(app).get(`${BASE}/resumen`).set(auth(TOK.benef));
      expect(res2.body.proxima_apertura_estimada).toBeNull();
      expect(res2.body.mensaje_convocatoria).toContain('no hay convocatoria abierta');
    });

    it('un usuario BENEFICIARIO sin perfil recibe un resumen vacio (no 500)', async () => {
      fake.tablas.beneficiario = fake.tablas.beneficiario!.filter((b) => b.id !== B1);
      const res = await request(app).get(`${BASE}/resumen`).set(auth(TOK.benef));
      expect(res.status).toBe(200);
      expect(res.body.saludo.tiene_perfil).toBe(false);
      expect(res.body.postulaciones).toEqual([]);
      expect(res.body.puede_iniciar_postulacion).toBe(true);
    });
  });

  describe('GET /postulaciones/:id/linea-tiempo', () => {
    it('traduce hitos a lenguaje claro, oculta movimientos internos y anonimiza observaciones', async () => {
      const res = await request(app).get(`${BASE}/postulaciones/${P2}/linea-tiempo`).set(auth(TOK.benef));
      expect(res.status).toBe(200);
      const b = res.body;
      expect(b.postulacion).toMatchObject({ id: P2, estado: 'EN_CORRECCION', estado_texto: 'Documentos pendientes de correccion' });
      const estados = b.hitos.map((h: { estado: string }) => h.estado);
      // La liberacion (EN_EVALUACION -> PENDIENTE) y la segunda toma no se exponen
      expect(estados).toEqual(['BORRADOR', 'PENDIENTE', 'EN_EVALUACION', 'EN_CORRECCION']);
      expect(b.hitos[2].titulo).toBe('En revision por el Comite FOEST');
      expect(b.hitos[3].actual).toBe(true);
      expect(b.hitos[3].observacion).toMatchObject({ firma: 'Equipo FOEST', campos_observados: ['datos.telefono'], documentos_observados: ['Certificado SISBEN'] });
      expect(b.ciclos).toHaveLength(1);
      expect(b.pendiente_modulo.evaluacion).toBe(true);
      expect(b.resultado_por_beneficio).toEqual([]);
    });

    it('contrato: ninguna respuesta contiene campos de actor ni el id del funcionario', async () => {
      const res = await request(app).get(`${BASE}/postulaciones/${P2}/linea-tiempo`).set(auth(TOK.benef));
      expect(contieneCamposActor(res.body)).toEqual([]);
      const texto = JSON.stringify(res.body);
      expect(texto).not.toContain(FUNC);
      expect(texto).not.toContain('func@foest.test');
      expect(texto).not.toContain('liberada por carga');
    });

    it('muestra aprobacion parcial con resultado por beneficio cuando existe el modulo evaluacion', async () => {
      const p = fake.tablas.postulacion!.find((x) => x.id === P2)!;
      p.estado = 'APROBADA';
      p.aprobacion_parcial = true;
      fake.tablas.historial_estado_postulacion!.push({
        id: 'h7',
        postulacion_id: P2,
        ciclo: 1,
        estado_anterior: 'EN_EVALUACION',
        estado_nuevo: 'APROBADA',
        motivo: 'DICTAMEN_APROBADO',
        actor_tipo: 'FUNCIONARIO',
        actor_id: FUNC,
        observaciones: 'Se aprueba matricula; transporte no cumple distancia.',
        cambiado_en: iso(0),
      });
      fake.tablas.revision = [
        { id: 'r1', postulacion_id: P2, ciclo: 1, resultado: 'APROBAR', observaciones: 'Se aprueba matricula; transporte no cumple distancia.', campos_observados: null, documentos_observados: null, decidida_en: iso(0), funcionario_id: FUNC },
      ];
      fake.tablas.revision_beneficio = [
        { revision_id: 'r1', beneficio_codigo: 'SUP', decision: 'APROBADO', motivo: null, monto_aprobado: '2500000.00' },
        { revision_id: 'r1', beneficio_codigo: 'ST', decision: 'RECHAZADO', motivo: 'La sede esta dentro del municipio.', monto_aprobado: null },
      ];
      const res = await request(app).get(`${BASE}/postulaciones/${P2}/linea-tiempo`).set(auth(TOK.benef));
      expect(res.status).toBe(200);
      expect(res.body.postulacion.estado_texto).toBe('Aprobada parcialmente: revise el resultado por beneficio');
      expect(res.body.resultado_por_beneficio).toEqual([
        expect.objectContaining({ beneficio_codigo: 'SUP', decision: 'APROBADO', monto_aprobado: 2500000, motivo_publico: null }),
        expect.objectContaining({ beneficio_codigo: 'ST', decision: 'RECHAZADO', motivo_publico: 'La sede esta dentro del municipio.' }),
      ]);
      expect(res.body.pendiente_modulo.evaluacion).toBe(false);
      expect(contieneCamposActor(res.body)).toEqual([]);
    });
  });

  describe('GET /postulaciones/:id/documentos', () => {
    it('sin modulo documentos responde vacio con pendiente_modulo', async () => {
      const res = await request(app).get(`${BASE}/postulaciones/${P2}/documentos`).set(auth(TOK.benef));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ postulacion_id: P2, ciclo: 1, documentos: [], pendiente_modulo: { documentos: true, evaluacion: true } });
    });

    it('deriva las insignias del chequeo del ultimo ciclo: PRESENTA, NO_PRESENTA, sin chequeo', async () => {
      fake.tablas.tipo_documento = [
        { id: 't-sisben', codigo: 'SISBEN', nombre: 'Certificado SISBEN' },
        { id: 't-cedula', codigo: 'CEDULA', nombre: 'Documento de identidad' },
        { id: 't-matricula', codigo: 'MATRICULA', nombre: 'Orden de matricula' },
      ];
      fake.tablas.documento = [
        { id: 'd1', postulacion_id: P2, tipo_id: 't-sisben', estado_carga: 'DISPONIBLE', eliminado: false },
        { id: 'd2', postulacion_id: P2, tipo_id: 't-cedula', estado_carga: 'DISPONIBLE', eliminado: false },
        { id: 'd3', postulacion_id: P2, tipo_id: 't-matricula', estado_carga: 'ESCANEANDO', eliminado: false },
      ];
      fake.tablas.revision = [{ id: 'r1', postulacion_id: P2, ciclo: 1, resultado: 'CORRECCION', observaciones: 'x', campos_observados: null, documentos_observados: null, decidida_en: iso(-1), funcionario_id: FUNC }];
      fake.tablas.revision_documento = [
        { revision_id: 'r1', tipo_id: 't-sisben', documento_id: 'd1', resultado: 'NO_PRESENTA', observacion_especifica: 'Debe ser del ano en curso', verificado_en: iso(-1) },
        { revision_id: 'r1', tipo_id: 't-cedula', documento_id: 'd2', resultado: 'PRESENTA', observacion_especifica: null, verificado_en: iso(-1) },
      ];
      const res = await request(app).get(`${BASE}/postulaciones/${P2}/documentos`).set(auth(TOK.benef));
      expect(res.status).toBe(200);
      const porTipo = Object.fromEntries(res.body.documentos.map((d: { tipo_codigo: string }) => [d.tipo_codigo, d]));
      expect(porTipo.SISBEN).toMatchObject({ estado: 'POR_CORREGIR', estado_texto: 'Por corregir' });
      expect(porTipo.SISBEN.observacion).toMatchObject({ firma: 'Equipo FOEST', texto: 'Debe ser del ano en curso' });
      expect(porTipo.CEDULA).toMatchObject({ estado: 'APROBADO', estado_texto: 'Aprobado' });
      expect(porTipo.MATRICULA).toMatchObject({ estado: 'PROCESANDO' });
      expect(res.body.pendiente_modulo).toEqual({ documentos: false, evaluacion: false });
      expect(contieneCamposActor(res.body)).toEqual([]);
    });
  });

  describe('GET /descargas y /otorgamientos', () => {
    it('responden vacio con pendiente_modulo cuando las tablas no existen', async () => {
      const d = await request(app).get(`${BASE}/descargas`).set(auth(TOK.benef));
      expect(d.status).toBe(200);
      expect(d.body).toMatchObject({ descargas: [], pendiente_modulo: { formatos: true } });
      const o = await request(app).get(`${BASE}/otorgamientos`).set(auth(TOK.benef));
      expect(o.status).toBe(200);
      expect(o.body).toEqual({ otorgamientos: [], pendiente_modulo: { seguimiento: true } });
    });

    it('otorgamientos muestra desembolsos y datos de pago solo enmascarados', async () => {
      fake.tablas.otorgamiento = [
        { id: 'o1', postulacion_id: P2, beneficiario_id: B1, convocatoria_id: C_OLD, beneficio_codigo: 'ST', estado: 'SUSPENDIDO', monto_aprobado: '300000', otorgado_en: iso(-10), creado_en: iso(-10), cuenta_pago_id: 'cp1' },
      ];
      fake.tablas.otorgamiento_evento = [{ otorgamiento_id: 'o1', estado_anterior: 'ACTIVO', estado_nuevo: 'SUSPENDIDO', motivo: 'Pendiente de certificado de matricula', actor_id: 'ad', ocurrido_en: iso(-2) }];
      fake.tablas.desembolso = [{ id: 'ds1', otorgamiento_id: 'o1', estado: 'PAGADO', monto: '150000', fecha_programada: '2026-03-01', fecha_pago: '2026-03-02', referencia: 'REF-1', concepto: 'Primer pago', registrado_por: 'ad', creado_en: iso(-5), actualizado_en: iso(-5) }];
      fake.tablas.cuenta_pago = [{ id: 'cp1', beneficiario_id: B1, tipo: 'BANCARIA', entidad: 'Banco X', numero_cifrado: 'SECRETO', ultimos4: '4321' }];
      const res = await request(app).get(`${BASE}/otorgamientos`).set(auth(TOK.benef));
      expect(res.status).toBe(200);
      expect(res.body.otorgamientos[0]).toMatchObject({
        beneficio_codigo: 'ST',
        estado_texto: 'Suspendido',
        motivo_publico: 'Pendiente de certificado de matricula',
        cuenta_pago: { tipo: 'BANCARIA', entidad: 'Banco X', ultimos4: '4321' },
      });
      expect(res.body.otorgamientos[0].desembolsos[0]).toMatchObject({ estado: 'PAGADO', monto: 150000, referencia_pago: 'REF-1' });
      expect(JSON.stringify(res.body)).not.toContain('SECRETO');
      expect(contieneCamposActor(res.body)).toEqual([]);
    });
  });
});
