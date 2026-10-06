/**
 * PRUEBA DE MATRIZ DE ACCESO (rol x endpoint) - docs/modules/roles_permissions.md,
 * DECISIONES section 2 (codigos) y section 7 (rutas publicas).
 *
 * Recorre TODOS los routers registrados en src/modules/index.ts (incluidos los
 * routers anidados y los middlewares a nivel de router) y, para cada ruta:
 *
 *   1. Si NO lleva `authenticate()` debe estar en RUTAS_PUBLICAS (lista cerrada
 *      de DECISIONES section 7, mas las adaptaciones de section 19). Cualquier
 *      otra ruta sin authenticate() hace fallar la prueba.
 *   2. Si lleva `authenticate()`: sin token responde 401 NO_AUTENTICADO.
 *   3. Si lleva `requirePermission(...)` / `requireAnyPermission(...)`: con un
 *      token simulado de cada rol que NO tiene el permiso responde 403
 *      SIN_PERMISO, y con cada rol que SI lo tiene NO responde 401 ni 403
 *      SIN_PERMISO (puede responder 404/409/422/5xx por falta de datos o
 *      credenciales; eso no es un fallo de autorizacion).
 *   4. Si lleva `authenticate()` pero NO `requirePermission`, debe estar en
 *      RUTAS_SOLO_AUTENTICADAS (rutas de "cualquier rol", p. ej. /auth/me).
 *
 * COMO FUNCIONA (sin tocar codigo de produccion):
 *   - `authenticate()` se sustituye por ./auth-simulada (tokens `test:<ROL>`),
 *     cuyo handler lleva la marca `__authenticate`.
 *   - `requirePermission` / `requireAnyPermission` se envuelven para que el
 *     handler devuelto lleve `__permisos` y `__modo` ('todos' | 'alguno').
 *   - Se leen `router.stack` / `layer.route` de Express 4 para construir la
 *     lista de rutas con sus handlers (incluyendo los heredados de `router.use`).
 *
 * COMO EXTENDERLA (agente de seguridad / nuevos modulos):
 *   - Nueva ruta publica: agregarla a RUTAS_PUBLICAS con "METODO /ruta" (los
 *     parametros se normalizan a `:p`, asi que `/publico/convocatorias/:id` y
 *     `/publico/convocatorias/:convocatoriaId` son equivalentes). Solo las de
 *     DECISIONES section 7; cualquier otra requiere decision documentada.
 *   - Nueva ruta "cualquier rol autenticado" (sin permiso de rol): agregarla a
 *     RUTAS_SOLO_AUTENTICADAS. Debe ser la excepcion, no la regla.
 *   - Ruta que, ademas del permiso, restringe por rol con un middleware propio
 *     (p. ej. `soloRoles('ADMINISTRADOR')` en accounts): declararla en
 *     RESTRICCION_ROL_ADICIONAL con los roles admitidos; la prueba exige 403
 *     SIN_PERMISO a los demas roles aunque la matriz les conceda el permiso.
 *   - Para comprobar alcance (404 recurso ajeno) o reglas de negocio (409/422)
 *     cada modulo tiene su propia prueba; esta solo cubre 401/403 por rol.
 *   - Si un modulo usa un middleware de autorizacion propio distinto de
 *     requirePermission, envuelvalo aqui del mismo modo (ver `envolverRbac`).
 */
import type { Router } from 'express';
import request from 'supertest';
import { MATRIZ_PERMISOS, ROLES, type Permiso, type Rol } from '@foest/shared';
import { tokenDe } from './auth-simulada';

jest.mock('../../../shared/auth.middleware', () => require('./auth-simulada').moduloAuthSimulado());

jest.mock('../../../shared/rbac.matrix', () => {
  const real = jest.requireActual<typeof import('../../../shared/rbac.matrix')>('../../../shared/rbac.matrix');
  const envolverRbac =
    (modo: 'todos' | 'alguno', fabrica: (...c: Permiso[]) => unknown) =>
    (...codigos: Permiso[]) =>
      Object.assign(fabrica(...codigos) as object, { __permisos: codigos, __modo: modo });
  return {
    ...real,
    requirePermission: envolverRbac('todos', real.requirePermission),
    requireAnyPermission: envolverRbac('alguno', real.requireAnyPermission),
  };
});

// --- Listas cerradas ------------------------------------------------------------

/** DECISIONES section 7 (lista cerrada) + adaptaciones de section 19 (Supabase Auth). */
const RUTAS_PUBLICAS: string[] = [
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'POST /auth/password/forgot',
  'POST /auth/password/reset',
  'GET /auth/verify-email/:p',
  'POST /auth/verify-email/resend',
  'POST /auth/invitacion/aceptar',
  'GET /publico/convocatorias',
  'GET /publico/convocatorias/:p',
  'GET /publico/verificar/:p',
  'GET /catalogos/consentimiento/vigente',
  // Adaptacion section 19: el texto de consentimiento lo sirve el modulo auth.
  'GET /auth/consentimiento/vigente',
  // Webhook del proveedor de correo: autenticado por firma HMAC, no por JWT.
  'POST /notificaciones/webhooks/correo',
  // Modulo de referencia (se elimina junto con el modulo ejemplo).
  'GET /ejemplo/publico',
];

/** Rutas con authenticate() pero sin permiso de rol: aplican a cualquier rol sobre lo propio. */
const RUTAS_SOLO_AUTENTICADAS: string[] = [
  'GET /auth/me',
  'POST /auth/logout',
  'POST /auth/password/change',
  'POST /auth/invitacion/aceptar',
  'GET /permisos/mios',
  // catalogos_configuracion.md: subconjunto no sensible de configuracion para la UI de cualquier rol.
  'GET /configuracion/publica',
];

/**
 * Rutas con un filtro de rol ADICIONAL al permiso (documentado en el .md del
 * modulo). Clave normalizada "METODO /ruta" -> roles admitidos.
 */
const RESTRICCION_ROL_ADICIONAL: Record<string, Rol[]> = {
  // accounts.md: el listado/busqueda de beneficiarios es solo del Administrador;
  // el Funcionario usa beneficiario:consultar unicamente en /beneficiarios/:id (alcance).
  'GET /beneficiarios': ['ADMINISTRADOR'],
  // postulaciones.md: tabla de endpoints (postulacion:consultar es de los tres
  // roles, pero cada ruta de lectura tiene sus roles; el Funcionario consulta
  // expedientes por el modulo evaluacion).
  'GET /postulaciones/me': ['BENEFICIARIO'],
  'GET /postulaciones': ['ADMINISTRADOR'],
  'GET /postulaciones/:p': ['BENEFICIARIO', 'ADMINISTRADOR'],
  'GET /postulaciones/:p/validacion': ['BENEFICIARIO'],
  'GET /postulaciones/:p/historial': ['BENEFICIARIO', 'ADMINISTRADOR'],
};

// --- Introspeccion de Express 4 -------------------------------------------------

interface HandlerMarcado {
  __authenticate?: boolean;
  __permisos?: Permiso[];
  __modo?: 'todos' | 'alguno';
}

interface RutaRegistrada {
  metodo: string;
  path: string;
  handlers: HandlerMarcado[];
}

interface LayerExpress {
  route?: { path: string | string[]; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> };
  handle: unknown & { stack?: LayerExpress[] };
  regexp?: RegExp & { fast_slash?: boolean };
  keys?: Array<{ name: string | number }>;
  name?: string;
}

/** Reconstruye el path de un `router.use(path, ...)` a partir de su RegExp. */
function pathDeLayer(layer: LayerExpress): string {
  const re = layer.regexp;
  if (!re || re.fast_slash) return '';
  let src = re.source;
  src = src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\$$/, '');
  const keys = layer.keys ?? [];
  let i = 0;
  src = src.replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, () => `:${String(keys[i++]?.name ?? 'p')}`);
  return src.replace(/\\\//g, '/');
}

function recorrer(router: Router, prefijo: string, heredados: HandlerMarcado[], salida: RutaRegistrada[]): void {
  const stack = (router as unknown as { stack: LayerExpress[] }).stack ?? [];
  let acumulados = [...heredados];
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const propios = layer.route.stack.map((l) => l.handle as HandlerMarcado);
      for (const metodo of Object.keys(layer.route.methods)) {
        if (metodo === '_all') continue;
        for (const p of paths) {
          salida.push({ metodo: metodo.toUpperCase(), path: unir(prefijo, p), handlers: [...acumulados, ...propios] });
        }
      }
    } else if (layer.handle && Array.isArray(layer.handle.stack)) {
      recorrer(layer.handle as unknown as Router, unir(prefijo, pathDeLayer(layer)), acumulados, salida);
    } else if (layer.handle) {
      acumulados = [...acumulados, layer.handle as HandlerMarcado];
    }
  }
}

function unir(a: string, b: string): string {
  const s = `${a}/${b}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return s === '' ? '/' : s;
}

/** Normaliza "GET /ruta/:id" -> "GET /ruta/:p" para comparar con las listas. */
function clave(r: { metodo: string; path: string }): string {
  return `${r.metodo} ${r.path.replace(/:[A-Za-z0-9_]+/g, ':p').replace(/\*/g, ':p')}`;
}

function urlDePrueba(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, '00000000-0000-4000-8000-000000000099').replace(/\*/g, 'x');
}

function rolesSinPermiso(h: HandlerMarcado): Rol[] {
  const permisos = h.__permisos ?? [];
  return ROLES.filter((rol) => {
    const tiene = permisos.map((p) => MATRIZ_PERMISOS[rol].includes(p));
    return h.__modo === 'alguno' ? !tiene.some(Boolean) : !tiene.every(Boolean);
  });
}

// --- Construccion de la lista -----------------------------------------------------

process.env.RATE_LIMIT_MAX = '1000000';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp, API_PREFIX } = require('../../../app') as typeof import('../../../app');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { modulos } = require('../../index') as typeof import('../../index');

const app = createApp();
const rutas: RutaRegistrada[] = [];
for (const m of modulos) recorrer(m.router, m.prefijo, [], rutas);

const publicas = new Set(RUTAS_PUBLICAS);
const soloAutenticadas = new Set(RUTAS_SOLO_AUTENTICADAS);
const protegidas = rutas.filter((r) => r.handlers.some((h) => h.__authenticate));
const sinAuth = rutas.filter((r) => !r.handlers.some((h) => h.__authenticate));

describe('matriz de acceso rol x endpoint', () => {
  it('hay al menos una ruta registrada', () => {
    expect(rutas.length).toBeGreaterThan(0);
  });

  it('toda ruta sin authenticate() esta en la lista cerrada de publicas (DECISIONES section 7)', () => {
    const noDeclaradas = sinAuth.map(clave).filter((k) => !publicas.has(k));
    expect(noDeclaradas).toEqual([]);
  });

  it('toda ruta con authenticate() pero sin requirePermission esta en RUTAS_SOLO_AUTENTICADAS', () => {
    const sinPermiso = protegidas.filter((r) => !r.handlers.some((h) => h.__permisos)).map(clave);
    const noDeclaradas = sinPermiso.filter((k) => !soloAutenticadas.has(k));
    expect(noDeclaradas).toEqual([]);
  });

  describe.each(protegidas.map((r) => [clave(r), r] as const))('%s', (_k, ruta) => {
    const url = `${API_PREFIX}${urlDePrueba(ruta.path)}`;
    const metodo = ruta.metodo.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    const enviar = (token?: string) => {
      const req = request(app)[metodo](url);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    it('401 sin token', async () => {
      const res = await enviar();
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    it('403 CUENTA_INACTIVA con usuario inactivo', async () => {
      const res = await enviar(tokenDe('ADMINISTRADOR', true));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CUENTA_INACTIVA');
    });

    const rbac = ruta.handlers.filter((h) => h.__permisos);
    const denegados = new Set<Rol>(rbac.flatMap(rolesSinPermiso));
    const restriccion = RESTRICCION_ROL_ADICIONAL[clave(ruta)];
    if (restriccion) for (const rol of ROLES) if (!restriccion.includes(rol)) denegados.add(rol);
    const permitidos = ROLES.filter((r) => !denegados.has(r));

    for (const rol of denegados) {
      it(`403 SIN_PERMISO para ${rol}`, async () => {
        const res = await enviar(tokenDe(rol));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SIN_PERMISO');
      });
    }

    for (const rol of permitidos) {
      it(`${rol} supera la autorizacion (no 401 ni 403 SIN_PERMISO)`, async () => {
        const res = await enviar(tokenDe(rol));
        expect(res.status).not.toBe(401);
        if (res.status === 403) expect(res.body.code).not.toBe('SIN_PERMISO');
      });
    }
  });
});
