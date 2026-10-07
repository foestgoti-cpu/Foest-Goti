import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';
import { MATRIZ_PERMISOS, ROLES, type Permiso, type Rol } from '@foest/shared';
import { requirePermission, tienePermiso } from '../shared/rbac.matrix';
import { errorHandler } from '../shared/errors';
import type { UsuarioAutenticado } from '../shared/types';

function appConRol(rol: Rol | null, permiso: Permiso) {
  const app = express();
  app.use((req, _res, next) => {
    if (rol) {
      const user: UsuarioAutenticado = { id: 'u', email: 'u@x.co', rol, token: 't' };
      req.user = user;
    }
    next();
  });
  app.get('/r', requirePermission(permiso), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('requirePermission', () => {
  it('403 cuando el rol no tiene el permiso', async () => {
    const res = await request(appConRol('BENEFICIARIO', 'evaluacion:dictaminar')).get('/r');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SIN_PERMISO');
  });
  it('200 cuando el rol tiene el permiso', async () => {
    const res = await request(appConRol('FUNCIONARIO', 'evaluacion:dictaminar')).get('/r');
    expect(res.status).toBe(200);
  });
  it('401 si no hay usuario autenticado', async () => {
    const res = await request(appConRol(null, 'catalogo:consultar')).get('/r');
    expect(res.status).toBe(401);
  });
  it('segregacion: el administrador no dictamina ni toma expedientes', () => {
    expect(tienePermiso('ADMINISTRADOR', 'evaluacion:dictaminar')).toBe(false);
    expect(tienePermiso('ADMINISTRADOR', 'asignacion:tomar')).toBe(false);
  });
});

describe('seed SQL de rol_permiso coincide con la matriz TS', () => {
  it('cada par (rol, permiso) de 0001_base.sql existe en MATRIZ_PERMISOS y viceversa', () => {
    const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/0001_base.sql'), 'utf8');
    const inicio = sql.indexOf('-- BEGIN SEED rol_permiso');
    const fin = sql.indexOf('-- END SEED rol_permiso');
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    let bloque = sql.slice(inicio, fin);
    // Permisos incorporados por migraciones posteriores: bloque `-- BEGIN SEED rol_permiso (NNNN)` ... `-- END SEED rol_permiso (NNNN)`.
    const dir = resolve(__dirname, '../../../../supabase/migrations');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql') && !n.startsWith('0001_'))) {
      const otro = readFileSync(resolve(dir, f), 'utf8');
      const i = otro.indexOf('-- BEGIN SEED rol_permiso');
      const j = otro.indexOf('-- END SEED rol_permiso');
      if (i > -1 && j > i) bloque += otro.slice(i, j);
    }
    const pares = new Set<string>();
    for (const m of bloque.matchAll(/\('(ADMINISTRADOR|FUNCIONARIO|BENEFICIARIO)',\s*'([a-z_]+:[a-z_]+)'\)/g)) {
      pares.add(`${m[1]}|${m[2]}`);
    }
    const esperados = new Set<string>();
    for (const rol of ROLES) for (const p of MATRIZ_PERMISOS[rol]) esperados.add(`${rol}|${p}`);
    expect([...pares].sort()).toEqual([...esperados].sort());
  });
});
