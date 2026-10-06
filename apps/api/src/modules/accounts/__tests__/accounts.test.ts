import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { crearSupabaseFake, type SupabaseFake } from './supabase.fake';

// Simula credenciales para que authenticate() valide tokens contra el Supabase falso.
jest.mock('../../../config/env', () => {
  const real = jest.requireActual('../../../config/env');
  return {
    ...real,
    hasSupabaseCredentials: () => true,
    requireSupabaseEnv: () => ({ url: 'http://supabase.local', anonKey: 'anon', serviceRoleKey: 'service' }),
  };
});

jest.mock('../../../shared/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { crearSupabaseFake } = require('./supabase.fake');
  const fake = crearSupabaseFake();
  return {
    __fake: fake,
    supabaseAdmin: fake.client,
    supabaseAsUser: () => fake.client,
    getSupabaseAdmin: () => fake.client,
    __setSupabaseAdminForTests: () => undefined,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fake: SupabaseFake = (require('../../../shared/supabase') as { __fake: SupabaseFake }).__fake;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require('../../../app') as typeof import('../../../app');

const app = createApp();
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const MOTIVO = 'Motivo administrativo de prueba con mas de quince caracteres';

function hace(anios: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - anios);
  return d.toISOString().slice(0, 10);
}

const perfilValido = (fecha: string) => ({
  tipo_documento: 'CC',
  numero_documento: '1012345678',
  expedido_en: 'Tocancipa',
  nombres: 'Ana Maria',
  apellidos: 'Perez Gomez',
  fecha_nacimiento: fecha,
  genero: 'FEMENINO',
  estado_civil: 'SOLTERO_A',
  direccion: 'Calle 1 # 2-3, barrio Centro',
  sector: 'Urbano',
  celular_1: '3001234567',
  correo_notificacion_2: 'ana.alterno@correo.co',
  estrato: 2,
});

describe('modulo accounts', () => {
  let admin: { id: string; token: string };
  let funcionario: { id: string; token: string };
  let beneficiario: { id: string; token: string };

  beforeEach(() => {
    fake.reiniciar();
    admin = fake.crearUsuario({ email: 'admin@tocancipa.gov.co', rol: 'ADMINISTRADOR', last_sign_in_at: new Date().toISOString() });
    funcionario = fake.crearUsuario({ email: 'func@tocancipa.gov.co', rol: 'FUNCIONARIO', last_sign_in_at: new Date().toISOString() });
    beneficiario = fake.crearUsuario({ email: 'estudiante@correo.co', rol: 'BENEFICIARIO' });
    fake.tabla('funcionario').push({ id: randomUUID(), usuario_id: funcionario.id, nombres: 'Carlos', apellidos: 'Ruiz', cargo: 'Profesional', dependencia: 'Educacion', creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() });
  });

  describe('acceso (DECISIONES section 2)', () => {
    it('401 sin token', async () => {
      const res = await request(app).get('/api/v1/funcionarios');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    it('403 cuando el rol no tiene el permiso (beneficiario crea funcionario)', async () => {
      const res = await request(app).post('/api/v1/funcionarios').set(bearer(beneficiario.token)).send({ email: 'x@y.co', nombres: 'Ab', apellidos: 'Cd', cargo: 'Ef', dependencia: 'Gh' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SIN_PERMISO');
    });

    it('403 cuando un funcionario intenta listar beneficiarios (alcance solo administrador)', async () => {
      const res = await request(app).get('/api/v1/beneficiarios').set(bearer(funcionario.token));
      expect(res.status).toBe(403);
    });

    it('404 cuando un funcionario consulta un beneficiario sin asignacion propia', async () => {
      const benId = randomUUID();
      fake.tabla('beneficiario').push({ id: benId, usuario_id: beneficiario.id, nombres: 'Ana', apellidos: 'Perez', es_menor: false, perfil_completo: false, anonimizado: false });
      const res = await request(app).get(`/api/v1/beneficiarios/${benId}`).set(bearer(funcionario.token));
      expect(res.status).toBe(404);
      expect(fake.tabla('auditoria_evento').some((e) => e.accion === 'LECTURA_SENSIBLE')).toBe(false);
    });

    it('200 + LECTURA_SENSIBLE cuando el funcionario esta en el comite de una convocatoria con postulacion del beneficiario', async () => {
      const benId = randomUUID();
      const convId = randomUUID();
      fake.tabla('beneficiario').push({ id: benId, usuario_id: beneficiario.id, nombres: 'Ana', apellidos: 'Perez', es_menor: false, perfil_completo: false, anonimizado: false });
      fake.tabla('convocatoria').push({ id: convId, nombre: 'Convocatoria 2026-1' });
      fake.tabla('asignacion_funcionario').push({ id: randomUUID(), convocatoria_id: convId, funcionario_id: funcionario.id, retirado_en: null });
      fake.tabla('postulacion').push({ id: randomUUID(), beneficiario_id: benId, convocatoria_id: convId, estado: 'PENDIENTE' });
      const res = await request(app).get(`/api/v1/beneficiarios/${benId}`).set(bearer(funcionario.token));
      expect(res.status).toBe(200);
      expect(res.body.beneficiario.id).toBe(benId);
      expect(fake.tabla('auditoria_evento').some((e) => e.accion === 'LECTURA_SENSIBLE' && e.entidad_id === benId)).toBe(true);
    });
  });

  describe('funcionarios', () => {
    it('caso feliz: el administrador invita a un funcionario (inviteUserByEmail + rol FUNCIONARIO + auditoria)', async () => {
      const res = await request(app)
        .post('/api/v1/funcionarios')
        .set(bearer(admin.token))
        .send({ email: 'Nuevo@Tocancipa.gov.co', nombres: 'Laura', apellidos: 'Diaz', cargo: 'Tecnico', dependencia: 'Educacion' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ email: 'nuevo@tocancipa.gov.co', nombres: 'Laura', activo: true, invitacion_pendiente: true });
      const invitacion = fake.llamadasAuth.find((l) => l.metodo === 'inviteUserByEmail');
      expect(invitacion?.args[0]).toBe('nuevo@tocancipa.gov.co');
      expect((invitacion?.args[1] as { redirectTo: string }).redirectTo).toBe('http://localhost:5173/invitacion');
      const rol = fake.llamadasAuth.find((l) => l.metodo === 'updateUserById');
      expect(rol?.args[1]).toEqual({ app_metadata: { rol: 'FUNCIONARIO' } });
      expect(fake.tabla('auditoria_evento').some((e) => e.accion === 'FUNCIONARIO_CREADO')).toBe(true);

      const lista = await request(app).get('/api/v1/funcionarios?q=laura').set(bearer(admin.token));
      expect(lista.status).toBe(200);
      expect(lista.body.total).toBe(2);
    });

    it('409 CORREO_EXISTENTE al invitar un correo ya registrado', async () => {
      const res = await request(app)
        .post('/api/v1/funcionarios')
        .set(bearer(admin.token))
        .send({ email: 'func@tocancipa.gov.co', nombres: 'Laura', apellidos: 'Diaz', cargo: 'Tecnico', dependencia: 'Educacion' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CORREO_EXISTENTE');
    });

    it('422 con datos invalidos (motivo corto) y 409 ASIGNACIONES_PENDIENTES al deshabilitar con expedientes pendientes', async () => {
      const funcRow = fake.tabla('funcionario')[0] as { id: string };
      const convId = randomUUID();
      fake.tabla('convocatoria').push({ id: convId, nombre: 'Convocatoria 2026-1' });
      fake.tabla('asignacion_funcionario').push({ id: randomUUID(), convocatoria_id: convId, funcionario_id: funcionario.id, retirado_en: null });
      fake.tabla('postulacion').push({ id: randomUUID(), beneficiario_id: randomUUID(), convocatoria_id: convId, estado: 'EN_EVALUACION', creado_en: '2026-01-01' });
      fake.tabla('postulacion').push({ id: randomUUID(), beneficiario_id: randomUUID(), convocatoria_id: convId, estado: 'APROBADA', creado_en: '2026-01-02' });

      const corto = await request(app).patch(`/api/v1/funcionarios/${funcRow.id}/estado`).set(bearer(admin.token)).send({ activo: false, motivo: 'corto' });
      expect(corto.status).toBe(422);

      const res = await request(app).patch(`/api/v1/funcionarios/${funcRow.id}/estado`).set(bearer(admin.token)).send({ activo: false, motivo: MOTIVO });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ASIGNACIONES_PENDIENTES');
      expect(res.body.details).toMatchObject({ regla: 'REASSIGNMENT_REQUIRED', pendientes: 1, asignaciones_activas: 1 });
      expect(res.body.details.expedientes).toHaveLength(1);
      expect(fake.tabla('usuario').find((u) => u.id === funcionario.id)?.activo).toBe(true);

      // forzar: true completa la deshabilitacion y la cuenta queda rechazada por authenticate()
      const forzado = await request(app).patch(`/api/v1/funcionarios/${funcRow.id}/estado`).set(bearer(admin.token)).send({ activo: false, motivo: MOTIVO, forzar: true });
      expect(forzado.status).toBe(200);
      expect(forzado.body.activo).toBe(false);
      const siguiente = await request(app).get('/api/v1/funcionarios').set(bearer(funcionario.token));
      expect([401, 403]).toContain(siguiente.status);
      expect(fake.tabla('auditoria_evento').some((e) => e.accion === 'FUNCIONARIO_DESHABILITADO')).toBe(true);
    });
  });

  describe('administradores', () => {
    it('409 ULTIMO_ADMINISTRADOR cuando el unico administrador activo intenta deshabilitarse', async () => {
      const res = await request(app).patch(`/api/v1/administradores/${admin.id}/estado`).set(bearer(admin.token)).send({ activo: false, motivo: MOTIVO });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ULTIMO_ADMINISTRADOR');
      expect(fake.tabla('usuario').find((u) => u.id === admin.id)?.activo).toBe(true);
    });

    it('409 AUTODESHABILITACION_NO_PERMITIDA al deshabilitar la propia cuenta habiendo otro administrador activo', async () => {
      fake.crearUsuario({ email: 'admin2@tocancipa.gov.co', rol: 'ADMINISTRADOR' });
      const res = await request(app).patch(`/api/v1/administradores/${admin.id}/estado`).set(bearer(admin.token)).send({ activo: false, motivo: MOTIVO });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('AUTODESHABILITACION_NO_PERMITIDA');
    });

    it('lista administradores y deshabilita/reactiva a otro administrador con auditoria', async () => {
      const otro = fake.crearUsuario({ email: 'admin2@tocancipa.gov.co', rol: 'ADMINISTRADOR' });
      const lista = await request(app).get('/api/v1/administradores').set(bearer(admin.token));
      expect(lista.status).toBe(200);
      expect(lista.body.total).toBe(2);

      const off = await request(app).patch(`/api/v1/administradores/${otro.id}/estado`).set(bearer(admin.token)).send({ activo: false, motivo: MOTIVO });
      expect(off.status).toBe(200);
      expect(off.body.activo).toBe(false);
      expect(fake.llamadasAuth.some((l) => l.metodo === 'updateUserById' && (l.args[1] as { ban_duration?: string }).ban_duration === '876600h')).toBe(true);
      expect(fake.tabla('auditoria_evento').some((e) => e.accion === 'ADMINISTRADOR_DESHABILITADO')).toBe(true);

      const on = await request(app).patch(`/api/v1/administradores/${otro.id}/estado`).set(bearer(admin.token)).send({ activo: true, motivo: MOTIVO });
      expect(on.status).toBe(200);
      expect(on.body.activo).toBe(true);
    });

    it('404 cuando el id no corresponde a un administrador', async () => {
      const res = await request(app).patch(`/api/v1/administradores/${funcionario.id}/estado`).set(bearer(admin.token)).send({ activo: false, motivo: MOTIVO });
      expect(res.status).toBe(404);
    });
  });

  describe('perfil del beneficiario (GE-F041 seccion 1)', () => {
    it('422 cuando un menor de edad envia el perfil sin acudiente', async () => {
      const res = await request(app).put('/api/v1/beneficiarios/me').set(bearer(beneficiario.token)).send(perfilValido(hace(16)));
      expect(res.status).toBe(422);
      expect(res.body.details.some((d: { path: string }) => d.path === 'acudiente')).toBe(true);
    });

    it('caso feliz: guarda el perfil, calcula es_menor y perfil_completo (falta consentimiento) y luego lo completa', async () => {
      const res = await request(app).put('/api/v1/beneficiarios/me').set(bearer(beneficiario.token)).send(perfilValido(hace(20)));
      expect(res.status).toBe(200);
      expect(res.body.es_menor).toBe(false);
      expect(res.body.perfil_completo).toBe(false);
      expect(res.body.campos_faltantes).toEqual(['consentimiento']);
      expect(res.body.beneficiario.numero_documento).toBe('1012345678');

      const consent = await request(app).post('/api/v1/beneficiarios/me/consentimientos').set(bearer(beneficiario.token));
      expect(consent.status).toBe(201);
      const me = await request(app).get('/api/v1/beneficiarios/me').set(bearer(beneficiario.token));
      expect(me.body.perfil_completo).toBe(true);
      expect(me.body.consentimiento_vigente).toMatchObject({ version: 1, aceptado: true });

      // Documento no editable por el titular
      const cambio = await request(app).put('/api/v1/beneficiarios/me').set(bearer(beneficiario.token)).send({ ...perfilValido(hace(20)), numero_documento: '999999999' });
      expect(cambio.status).toBe(422);
      expect(cambio.body.code).toBe('DOCUMENTO_NO_EDITABLE');
    });

    it('menor con acudiente completo: es_menor = true y acudiente guardado', async () => {
      const res = await request(app)
        .put('/api/v1/beneficiarios/me')
        .set(bearer(beneficiario.token))
        .send({
          ...perfilValido(hace(16)),
          acudiente: { tipo_documento: 'CC', numero_documento: '52123456', nombres: 'Marta', apellidos: 'Gomez', parentesco: 'MADRE', celular: '3109876543', correo: 'marta@correo.co' },
        });
      expect(res.status).toBe(200);
      expect(res.body.es_menor).toBe(true);
      expect(res.body.acudiente.parentesco).toBe('MADRE');
    });
  });

  describe('administracion de beneficiarios y habeas data', () => {
    it('corrige el documento con motivo (auditado) y rechaza duplicados con 409', async () => {
      const benId = randomUUID();
      fake.tabla('beneficiario').push({ id: benId, usuario_id: beneficiario.id, tipo_documento: 'TI', numero_documento: '1001', nombres: 'Ana', apellidos: 'Perez', es_menor: false, perfil_completo: false, anonimizado: false });
      fake.tabla('beneficiario').push({ id: randomUUID(), usuario_id: randomUUID(), tipo_documento: 'CC', numero_documento: '20022002', es_menor: false, perfil_completo: false, anonimizado: false });

      const dup = await request(app).patch(`/api/v1/beneficiarios/${benId}/documento`).set(bearer(admin.token)).send({ numero_documento: '20022002', motivo: MOTIVO });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('DOCUMENTO_DUPLICADO');

      const ok = await request(app).patch(`/api/v1/beneficiarios/${benId}/documento`).set(bearer(admin.token)).send({ tipo_documento: 'CC', numero_documento: '1012345678', motivo: MOTIVO });
      expect(ok.status).toBe(200);
      expect(ok.body.numero_documento).toBe('1012345678');
      const evento = fake.tabla('auditoria_evento').find((e) => e.accion === 'DOCUMENTO_IDENTIDAD_CORREGIDO') as { datos_antes: { numero_documento: string }; datos_despues: { numero_documento: string } };
      expect(evento.datos_antes.numero_documento).toBe('***001');
      expect(evento.datos_despues.numero_documento).toBe('***678');
    });

    it('supresion: 409 SUPRESION_NO_PROCEDE con postulaciones en tramite; sin ellas se anonimiza al resolver', async () => {
      const benId = randomUUID();
      fake.tabla('beneficiario').push({ id: benId, usuario_id: beneficiario.id, tipo_documento: 'CC', numero_documento: '1001', nombres: 'Ana', apellidos: 'Perez', es_menor: false, perfil_completo: true, anonimizado: false });
      const post = { id: randomUUID(), beneficiario_id: benId, convocatoria_id: randomUUID(), estado: 'EN_CORRECCION' };
      fake.tabla('postulacion').push(post);

      const bloqueada = await request(app).post('/api/v1/beneficiarios/me/habeas-data').set(bearer(beneficiario.token)).send({ tipo: 'SUPRESION', detalle: 'Solicito la supresion de mis datos personales' });
      expect(bloqueada.status).toBe(409);
      expect(bloqueada.body.code).toBe('SUPRESION_NO_PROCEDE');

      post.estado = 'RECHAZADA';
      const radicada = await request(app).post('/api/v1/beneficiarios/me/habeas-data').set(bearer(beneficiario.token)).send({ tipo: 'SUPRESION', detalle: 'Solicito la supresion de mis datos personales' });
      expect(radicada.status).toBe(201);

      const bandeja = await request(app).get('/api/v1/habeas-data/solicitudes').set(bearer(admin.token));
      expect(bandeja.status).toBe(200);
      expect(bandeja.body.data[0]).toMatchObject({ tipo: 'SUPRESION', estado: 'RADICADA', email: 'estudiante@correo.co' });

      const resuelta = await request(app).patch(`/api/v1/habeas-data/solicitudes/${radicada.body.id}/resolver`).set(bearer(admin.token)).send({ decision: 'APROBAR', motivo: MOTIVO });
      expect(resuelta.status).toBe(200);
      expect(resuelta.body.estado).toBe('RESUELTA');
      const ben = fake.tabla('beneficiario').find((b) => b.id === benId) as { anonimizado: boolean; nombres: string; numero_documento: string };
      expect(ben.anonimizado).toBe(true);
      expect(ben.nombres).toBe('ANONIMIZADO');
      expect(ben.numero_documento.startsWith('ANON-')).toBe(true);
      expect(fake.tabla('usuario').find((u) => u.id === beneficiario.id)?.activo).toBe(false);
      expect(fake.tabla('auditoria_evento').some((e) => e.accion === 'ANONIMIZACION')).toBe(true);
      // El beneficiario ya no puede usar la plataforma
      const despues = await request(app).get('/api/v1/beneficiarios/me').set(bearer(beneficiario.token));
      expect([401, 403]).toContain(despues.status);
    });
  });
});
