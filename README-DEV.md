# FOEST - Guia de desarrollo

Monorepo (npm workspaces, Node 22, TypeScript estricto) de la plataforma del Fondo para la Educacion Superior de Tocancipa. La especificacion funcional vive en `docs/` (`docs/DECISIONES.md` manda sobre el resto; su seccion 19 fija Supabase como persistencia y autenticacion).

```
.
|- apps/api            Express + TypeScript (CommonJS). Capa de negocio/API bajo /api/v1
|- apps/web            Vite + React 18 + TypeScript + react-router v6 + TanStack Query + Tailwind
|- packages/shared     @foest/shared: enums, matriz de permisos, esquemas Zod y tipos compartidos
|- supabase/migrations SQL plano (sin Prisma); 0001_base.sql es el esquema fundacional
|- docs/               Especificacion (solo lectura para los agentes de modulo)
```

## 1. Instalar

```bash
# Node >= 22 y npm >= 10
npm install            # instala las tres carpetas de trabajo y enlaza @foest/shared
```

## 2. Variables de entorno

No hay claves en el repositorio. Copie los ejemplos y complete los valores desde Supabase -> Project Settings -> API (proyecto `kixjejmewgynzrppowfv`):

```bash
cp apps/api/.env.example apps/api/.env     # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PORT, WEB_ORIGIN
cp apps/web/.env.example apps/web/.env     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
```

Sin claves la API arranca igual: `GET /api/v1/health` responde `{ ok: true, supabase: 'sin_credenciales' }` y las rutas autenticadas responden `503 SIN_CREDENCIALES_SUPABASE`. La web muestra un aviso en /login. La `service_role` NUNCA va en `apps/web`.

## 3. Base de datos (Supabase)

Ver `supabase/README.md`. Resumen:

- **Editor SQL** (sin instalar nada): pegar cada archivo de `supabase/migrations/` en SQL Editor y ejecutarlo, en orden numerico (0001, 0002, ... ; no existe 0007). Todas son idempotentes. Estado al dia de hoy: 0001 a 0012 aplicadas en el proyecto.
- **CLI** (sin instalacion global): `npx supabase login`, `npx supabase link --project-ref kixjejmewgynzrppowfv`, `npx supabase db push`.

Luego:

```bash
# Primer administrador (idempotente). Requiere ADMIN_EMAIL y ADMIN_PASSWORD en apps/api/.env
npm run seed:admin
# Informe de conexion, tablas clave y RLS
npm run verify:supabase
```

## 4. Correr

```bash
npm run dev                 # api en http://localhost:4000/api/v1 y web en http://localhost:5173 (concurrently)
npm run dev -w apps/api     # solo API (tsx watch)
npm run dev -w apps/web     # solo web (vite)
```

## 5. Verificar

```bash
npm run typecheck   # compila @foest/shared y comprueba tipos de api y web
npm run build       # shared -> api (dist/) -> web (dist/)
npm test            # jest (shared, api) + vitest (web)
npm run lint
```

---

## 6. Convenciones para los agentes de modulo

### 6.1 Compartido (`packages/shared`)

Todo enum, codigo de permiso, esquema Zod o tipo que usen API y web va en `packages/shared/src/<modulo>/` y se reexporta desde `packages/shared/src/index.ts`. Ya existen: `Rol`, `EstadoPostulacion`, `EstadoConvocatoria`, `TipoSolicitud`, `CodigoBeneficio`, `PERMISOS`/`MATRIZ_PERMISOS`, `ApiError`, `Paginado`, `PaginacionQuerySchema`, `PasswordSchema`, `EmailSchema`, `MotivoSchema`, `ConfirmarSchema`, `VersionSchema`, `IdParamSchema`. Tras cambiar shared: `npm run build -w packages/shared` (el typecheck de la raiz ya lo hace).

### 6.2 API (`apps/api`)

Estructura obligatoria por modulo:

```
apps/api/src/modules/<modulo>/
  <modulo>.routes.ts       export const <modulo>Routes: Router
  <modulo>.controller.ts   traduce HTTP <-> servicio; sin reglas de negocio
  <modulo>.service.ts      reglas de negocio y acceso a datos
  <modulo>.dto.ts          esquemas Zod (reutiliza @foest/shared)
  <modulo>.types.ts        tipos internos
  __tests__/<modulo>.test.ts   Jest + Supertest
```

Registrar el router en `apps/api/src/modules/index.ts`:

```ts
import { convocatoriasRoutes } from './convocatorias/convocatorias.routes';
export const modulos: ModuloRegistrado[] = [
  { prefijo: '/convocatorias', router: convocatoriasRoutes },
  { prefijo: '/publico/convocatorias', router: convocatoriasPublicoRoutes },
];
```

Cadena de middlewares (importar todo desde `../../shared`):

```ts
import { Router } from 'express';
import { authenticate, requirePermission, validate, AppError, auditar, contextoDesdeRequest,
         supabaseAdmin, supabaseAsUser, usuarioActual, parsearPaginacion, rangoSupabase, paginar } from '../../shared';

router.patch('/:id/habilitar',
  authenticate(),                               // 401 sin token; 403 CUENTA_INACTIVA si usuario.activo = false
  requirePermission('convocatoria:habilitar'),  // 403 si el rol no tiene el permiso (matriz de @foest/shared)
  validate({ params: IdParamSchema, body: HabilitarDto }), // 422 con details de Zod
  controller.habilitar);
```

- `req.user = { id, email, rol, token }`. En el servicio: `supabaseAsUser(user.token)` para lecturas/escrituras del usuario (RLS aplica); `supabaseAdmin` solo para operaciones de sistema (auditoria, cambios de estado por jobs, cambios de rol en `auth.admin.updateUserById`).
- Alcance (recurso ajeno / no asignado / excluido) -> `throw AppError.noEncontrado()` (404), nunca 403. Conflicto de estado/version -> `AppError.conflicto('VERSION_CONFLICTO', ...)` (409). Datos incompletos -> `AppError.datosInvalidos('PERFIL_INCOMPLETO', ...)` (422).
- Auditoria: `await auditar({ ...contextoDesdeRequest(req), accion: 'HABILITAR', entidad: 'CONVOCATORIA', entidad_id: id, datos_antes, datos_despues, metadatos })`. Redacta campos sensibles automaticamente; si falla, lanza (la operacion debe fallar).
- Paginacion: `const p = parsearPaginacion(req.query); const { desde, hasta } = rangoSupabase(p); ... res.json(paginar(data, p, count))`.
- Rutas publicas: solo las de la lista cerrada de `DECISIONES.md` section 7 (sin `authenticate()`).
- Migraciones: `supabase/migrations/000N_<modulo>.sql`, idempotentes, con RLS y politicas para cada tabla nueva.
- Pruebas: deben pasar sin claves (`npm test`). Para servicios, inyectar/mockear el cliente de Supabase (`__setSupabaseAdminForTests`).

### 6.3 Web (`apps/web`)

Estructura por modulo:

```
apps/web/src/modules/<modulo>/
  routes.tsx     export const <modulo>Routes: RutasModulo  ({ rutasPublicas?, rutasBeneficiario?, rutasFuncionario?, rutasAdmin? })
  pages/         paginas (una por ruta)
  components/    componentes propios del modulo
  hooks/         hooks de datos (TanStack Query) sobre api.ts
  api.ts         funciones que envuelven `api` de src/lib/api.ts
  types.ts       tipos del modulo
```

- Registrar en `apps/web/src/modules/index.ts` (`modulos: RutasModulo[]`). Las rutas son relativas al arbol del rol: `rutasAdmin: [{ path: 'convocatorias', element: <ConvocatoriasAdminPage /> }]` se sirve en `/admin/convocatorias` dentro de `AppShell` y protegida por `ProtectedRoute roles={['ADMINISTRADOR']}`.
- Navegacion lateral: agregar entradas en `apps/web/src/navigation.ts` (por rol).
- Llamadas a la API: `api.get/post/put/patch/delete` de `src/lib/api.ts` (adjunta Bearer de la sesion de Supabase y refresca una vez ante 401; errores como `ApiRequestError { status, code, message, details }`).
- Sesion: `useAuth()` de `src/lib/auth/AuthProvider.tsx` (`session`, `user`, `rol`, `loading`, `iniciarSesion`, `cerrarSesion`). `rol` viene de `app_metadata.rol` y es solo ergonomia; la autorizacion real es de la API.
- UI: usar exclusivamente `src/components/ui` (Button, Input, Select, Textarea, Checkbox, Card, Table, Badge, Alert, Modal con doble intencion, PageHeader, EmptyState, Spinner, FormField). Paleta fija por Tailwind: `white`, `primary`, `primary-10`, `primary-20` (azul #0066ff y tintes), `ink` (texto negro) y `danger`, `danger-10` (rojo #d32f2f, solo para errores y validaciones); ninguna otra clase de color compila. Radios: `rounded-lg` (campos, botones), `rounded-xl` (tarjetas, modales, tablas), `rounded-md` (insignias). `Input type="password"` incluye ojo para mostrar/ocultar. Sin emojis ni iconos decorativos.
- Pruebas: Vitest + RTL en `__tests__/` junto al componente o pagina.

### 6.4 Servicios transversales de los modulos P0 (usarlos, no recrearlos)

- **Notificaciones y correo** (`apps/api/src/modules/notificaciones`): nunca insertar directo en `notificacion` ni enviar correo por cuenta propia.
  ```ts
  import { encolarNotificacion, alertarAdministradores, registrarFuenteRecordatorio } from '../notificaciones';
  await encolarNotificacion({ usuario_id, tipo: 'CORRECCION_SOLICITADA', titulo, mensaje, entidad: 'POSTULACION', entidad_id, url_destino, clave_dedup?, correo?: true, payload?: { fecha_limite } });
  ```
  `tipo` debe pertenecer al catalogo cerrado de `@foest/shared` (`TIPOS_NOTIFICACION`); si falta uno, se agrega en `packages/shared/src/notificaciones` y en `plantillas/catalogo.ts`. El correo sale por el outbox (`evento_outbox`) con reintentos; sin variables SMTP se imprime en el log (`ConsoleMailer`). Las plantillas hacia beneficiarios firman "Equipo FOEST" y rechazan variables `evaluador*`. Recordatorios programados: registrar una `FuenteRecordatorio` con `registrarFuenteRecordatorio`.
- **Configuracion, festivos, dias habiles, SNIES y declaraciones** (`apps/api/src/modules/catalogos_configuracion`):
  ```ts
  import { configuracionService, sniesService, declaracionService, sumarDiasHabiles, diasHabilesEntre, esDiaHabil } from '../catalogos_configuracion';
  const dias = await configuracionService.getEntero('SUBSANACION_DIAS_HABILES', 5);   // cache 60 s
  const limite = await sumarDiasHabiles('2026-10-06', dias);                           // usa la tabla festivo
  ```
  Claves y valores por defecto en `configuracion.defaults.ts` y en `@foest/shared` (`CLAVES_CONFIGURACION`). En SQL existen `fn_es_dia_habil`, `fn_sumar_dias_habiles`, `fn_dias_habiles_entre`.
- **Auditoria** (`apps/api/src/shared/audit.ts` + modulo `auditoria`): `auditar({...contextoDesdeRequest(req), accion, entidad, ...})` dentro de la operacion; para eventos fuera de una peticion (jobs, login fallido) `auditarFueraDeTx()` de `../auditoria/auditoria.cola`. Acciones y entidades solo del catalogo cerrado de `@foest/shared` (`ACCIONES_AUDITORIA`, `ENTIDADES_AUDITORIA`); la cadena de hashes la calcula un trigger SQL.

### 6.5 Reglas transversales

- Codigos de respuesta: 401 / 403 (rol o CUENTA_INACTIVA) / 404 (ajeno) / 409 (estado-version) / 422 (datos). Error siempre `{ code, message, details? }`.
- `docs/` no se modifica. Si un modulo detecta una contradiccion con `DECISIONES.md`, gana `DECISIONES.md` (seccion 19 sobre el resto) y se deja nota en el PR.
- No commits sin indicacion expresa. Nunca claves en el repositorio.

### 6.6 Dependencias y `npm audit`

El proyecto debe mantenerse en **0 vulnerabilidades** (`npm audit`). Dos piezas de configuracion lo sostienen y no deben revertirse sin sustituirlas:

- `overrides` en el `package.json` de la raiz: `shell-quote ^1.12.0` (corrige una vulnerabilidad critica de `concurrently`) y `js-yaml ^4.1.0`. La segunda corta una cadena de 20 alertas moderadas (`babel-plugin-istanbul` -> `@istanbuljs/load-nyc-config` -> `js-yaml` 3 -> `argparse` 1 -> `sprintf-js`, sin version corregida); `js-yaml` 4 ya no depende de `sprintf-js`.
- `@istanbuljs/load-nyc-config` como devDependency de `apps/api`: sin ella npm no instala esa libreria y la cobertura de Jest (`jest --coverage`) fallaria al cargar la configuracion.
- Tras cambiar overrides, si npm no re-resuelve el arbol, se quitan de `package-lock.json` las entradas afectadas y se ejecuta `npm install`. Verificar siempre que `npm audit` quede en 0 **y** que `npm test` y `jest --coverage` sigan funcionando (un audit en cero por ausencia de un paquete necesario no es un arreglo).

Avisos de deprecacion de `npm install` (`whatwg-encoding`, `glob` 10) no son vulnerabilidades: vienen de `jsdom` y de utilidades de prueba.
