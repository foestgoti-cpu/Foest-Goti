import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { MATRIZ_PERMISOS, PERMISOS, ROLES, type Rol } from '@foest/shared';
import { tokenDe } from './auth-simulada';

jest.mock('../../../shared/auth.middleware', () => require('./auth-simulada').moduloAuthSimulado());

import { createApp } from '../../../app';
import { DESCRIPCION_ROL, META_PERMISOS } from '../roles_permissions.catalogo';

const app = createApp();
const bearer = (rol: Rol, inactivo = false) => ({ Authorization: `Bearer ${tokenDe(rol, inactivo)}` });

describe('roles_permissions - acceso (DECISIONES section 2)', () => {
  it.each(['/api/v1/roles', '/api/v1/roles/ADMINISTRADOR/permisos', '/api/v1/permisos', '/api/v1/permisos/matriz', '/api/v1/permisos/mios'])(
    '401 sin token en %s',
    async (ruta) => {
      const res = await request(app).get(ruta);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    },
  );

  it.each<[Rol, string]>([
    ['FUNCIONARIO', '/api/v1/roles'],
    ['BENEFICIARIO', '/api/v1/roles'],
    ['FUNCIONARIO', '/api/v1/permisos'],
    ['BENEFICIARIO', '/api/v1/permisos/matriz'],
    ['BENEFICIARIO', '/api/v1/roles/BENEFICIARIO/permisos'],
  ])('403 SIN_PERMISO para %s en %s (rol sin rol:consultar)', async (rol, ruta) => {
    const res = await request(app).get(ruta).set(bearer(rol));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SIN_PERMISO');
  });

  it('403 CUENTA_INACTIVA antes de evaluar permisos', async () => {
    const res = await request(app).get('/api/v1/roles').set(bearer('ADMINISTRADOR', true));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CUENTA_INACTIVA');
  });

  it('404 para un rol inexistente (uuid desconocido, sin revelar nada)', async () => {
    const res = await request(app).get('/api/v1/roles/00000000-0000-4000-8000-0000000000aa/permisos').set(bearer('ADMINISTRADOR'));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROL_NO_ENCONTRADO');
  });

  it('422 cuando :id no es nombre de rol ni uuid', async () => {
    const res = await request(app).get('/api/v1/roles/SUPERUSUARIO/permisos').set(bearer('ADMINISTRADOR'));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('DATOS_INVALIDOS');
  });
});

describe('roles_permissions - caso feliz (ADMINISTRADOR)', () => {
  it('GET /roles lista los tres roles base inmutables con descripcion', async () => {
    const res = await request(app).get('/api/v1/roles').set(bearer('ADMINISTRADOR'));
    expect(res.status).toBe(200);
    const nombres = res.body.data.map((r: { nombre: string }) => r.nombre);
    expect(nombres).toEqual([...ROLES]);
    for (const r of res.body.data) {
      expect(r.es_base).toBe(true);
      expect(r.descripcion).toBe(DESCRIPCION_ROL[r.nombre as Rol]);
      expect(r.total_permisos).toBe(MATRIZ_PERMISOS[r.nombre as Rol].length);
    }
  });

  it('GET /roles/:id/permisos devuelve exactamente los permisos de la matriz', async () => {
    const res = await request(app).get('/api/v1/roles/FUNCIONARIO/permisos').set(bearer('ADMINISTRADOR'));
    expect(res.status).toBe(200);
    const codigos = res.body.permisos.map((p: { codigo: string }) => p.codigo).sort();
    expect(codigos).toEqual([...MATRIZ_PERMISOS.FUNCIONARIO].sort());
    expect(res.body.permisos[0]).toMatchObject({ categoria: expect.any(String), alcance: expect.any(String), regla_alcance: expect.any(String) });
  });

  it('GET /permisos entrega el catalogo completo con categoria y alcance', async () => {
    const res = await request(app).get('/api/v1/permisos').set(bearer('ADMINISTRADOR'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(PERMISOS.length);
    for (const p of res.body.data) {
      expect(['GLOBAL', 'ASIGNADO', 'PROPIO', 'COMITE', 'PUBLICO']).toContain(p.alcance);
      expect(p.categoria).not.toBe('OTROS');
    }
  });

  it('GET /permisos/matriz refleja MATRIZ_PERMISOS y la segregacion de deberes', async () => {
    const res = await request(app).get('/api/v1/permisos/matriz').set(bearer('ADMINISTRADOR'));
    expect(res.status).toBe(200);
    expect(res.body.roles).toHaveLength(3);
    expect(res.body.filas).toHaveLength(PERMISOS.length);
    for (const fila of res.body.filas) {
      for (const rol of ROLES) {
        expect(fila.roles[rol]).toBe(MATRIZ_PERMISOS[rol].includes(fila.codigo));
      }
    }
    const dictaminar = res.body.filas.find((f: { codigo: string }) => f.codigo === 'evaluacion:dictaminar');
    expect(dictaminar.roles).toEqual({ ADMINISTRADOR: false, FUNCIONARIO: true, BENEFICIARIO: false });
    expect(res.body.categorias[0]).toBe('CUENTAS');
  });
});

describe('roles_permissions - GET /permisos/mios (cualquier rol)', () => {
  it.each(ROLES)('%s recibe sus permisos efectivos calculados en servidor', async (rol) => {
    const res = await request(app).get('/api/v1/permisos/mios').set(bearer(rol));
    expect(res.status).toBe(200);
    expect(res.body.rol).toBe(rol);
    expect([...res.body.permisos].sort()).toEqual([...MATRIZ_PERMISOS[rol]].sort());
  });
});

describe('roles_permissions - consistencia catalogo TS <-> seed SQL (0001_base.sql)', () => {
  const sql = readFileSync(resolve(__dirname, '../../../../../../supabase/migrations/0001_base.sql'), 'utf8');

  it('cada permiso de PERMISOS tiene metadatos en META_PERMISOS', () => {
    const faltantes = PERMISOS.filter((p) => !META_PERMISOS[p]);
    expect(faltantes).toEqual([]);
  });

  it('categoria, alcance y descripcion coinciden con `insert into public.permiso`', () => {
    const inicio = sql.indexOf('insert into public.permiso (codigo, categoria, alcance, descripcion) values');
    expect(inicio).toBeGreaterThan(-1);
    const fin = sql.indexOf('on conflict (codigo) do update', inicio);
    const bloque = sql.slice(inicio, fin);
    const enSql = new Map<string, { categoria: string; alcance: string; descripcion: string }>();
    for (const m of bloque.matchAll(/\('([a-z_]+:[a-z_]+)',\s*'([A-Z_]+)',\s*'([A-Z]+)',\s*'((?:[^']|'')*)'\)/g)) {
      const [, codigo = '', categoria = '', alcance = '', descripcion = ''] = m;
      enSql.set(codigo, { categoria, alcance, descripcion: descripcion.replace(/''/g, "'") });
    }
    expect([...enSql.keys()].sort()).toEqual([...PERMISOS].sort());
    for (const codigo of PERMISOS) {
      const meta = META_PERMISOS[codigo]!;
      expect({ codigo, ...enSql.get(codigo) }).toEqual({
        codigo,
        categoria: meta.categoria,
        alcance: meta.alcance,
        descripcion: meta.descripcion,
      });
    }
  });

  it('las descripciones de los roles coinciden con `insert into public.rol`', () => {
    for (const rol of ROLES) {
      const re = new RegExp(`\\('${rol}',\\s*'([^']*)'\\)`);
      const m = sql.match(re);
      expect(m?.[1]).toBe(DESCRIPCION_ROL[rol]);
    }
  });
});
