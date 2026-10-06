# Prompt — Módulo `catalogos_configuracion` (Plataforma FOEST)

## 1. Rol y objetivo

Eres un desarrollador senior full-stack (TypeScript, Node/Express, React, PostgreSQL/Supabase). Tu única tarea es desarrollar el módulo **`catalogos_configuracion`** (fase P0) de la plataforma FOEST, a partir del archivo **`catalogos_configuracion.md` adjunto**, encajándolo en la infraestructura que se describe en la sección 2.

- El `.md` adjunto es la **fuente de verdad** de requerimientos, historias de usuario, endpoints, modelos de datos y reglas de negocio. **Léelo completo antes de escribir una línea de código.**
- Si algo del `.md` es ambiguo, o contradice la infraestructura descrita aquí (por ejemplo, menciona JWT propio, Prisma, S3/MinIO, BullMQ, tabla `SESION`, o rutas de archivos distintas), **señálalo explícitamente en tu resumen** y asume lo que sea compatible con la infraestructura: Supabase Auth y Storage, migraciones SQL planas, `node-cron` para trabajos programados, y las convenciones de la sección 2.
- Número de migración asignado a este módulo: **`supabase/migrations/0010_catalogos_configuracion.sql`**.
- Nombres de archivo: usa exactamente `catalogos_configuracion` como nombre de carpeta en API y web (`apps/api/src/modules/catalogos_configuracion/`, `apps/web/src/modules/catalogos_configuracion/`).

### 1.1 Contexto específico de este módulo

- YA EXISTE una implementación mínima de configuración y festivos dentro de `apps/api/src/modules/admin_dashboard/` (archivos `configuracion.service.ts`, `festivos.service.ts`, routers `configuracionRoutes` montado en `/configuracion` con `GET /`, `GET /:clave`, `PUT /:clave {valor, version, motivo?, confirmar?}` → 409 `VERSION_DESACTUALIZADA`, 422 `VALOR_FUERA_DE_RANGO` / `VALOR_INVALIDO` / `CONFIRMACION_REQUERIDA` / `CLAVE_NO_EDITABLE`; y `festivosRoutes` en `/festivos` con `GET ?anio=`, `POST`, `DELETE /:id`) y páginas web `/admin/configuracion` y `/admin/festivos` en `apps/web/src/modules/admin_dashboard/`. Tu módulo es el dueño definitivo de esa funcionalidad: implementa en tu carpeta `configuracionRoutes` y `festivosRoutes` **manteniendo exactamente los mismos contratos HTTP** (rutas, cuerpos, códigos de error) para no romper el panel de administración, y amplíalos con lo que pide el .md (catálogo SNIES con importación CSV, declaraciones juramentadas versionadas, texto de consentimiento versionado, endpoints públicos mínimos). En "Cambios requeridos" indica que en `apps/api/src/modules/index.ts` las entradas `/configuracion` y `/festivos` deben pasar a importar de tu módulo, y que las páginas web de configuración y festivos de admin_dashboard pueden retirarse cuando tus páginas las reemplacen (tus rutas web deben ser las mismas: `configuracion` y `festivos` bajo rutasAdmin; además añade `catalogos/snies` y `catalogos/declaraciones`).
- Rutas públicas que puedes exponer sin `authenticate()` (lista cerrada): `GET /catalogos/consentimiento/vigente`. El módulo auth ya expone `GET /auth/consentimiento/vigente` leyendo `configuracion_sistema.CONSENTIMIENTO_TEXTO` y la función SQL `consentimiento_vigente()` (0002): mantén compatibilidad (misma clave/tabla).
- Tablas `configuracion_sistema` y `festivo` ya existen con seed; `declaracion_juramentada` existe (DECL_1..6, texto PROVISIONAL, campo `texto_oficial_confirmado`). Crea en tu migración lo que falte: `ies_snies`, `programa_snies`, `importacion_snies`, `texto_consentimiento` (si decides versionarlo en tabla, mantén `CONSENTIMIENTO_TEXTO` sincronizado), columnas nuevas solo vía `alter table ... add column if not exists`.
- Permisos a usar: `configuracion:consultar`, `configuracion:editar`, `catalogo:consultar`, `catalogo:administrar`. Días hábiles: reutiliza `fn_es_dia_habil`, `fn_sumar_dias_habiles`, `fn_dias_habiles_entre` (0009); si el .md pide una utilidad `business-days` en Node, créala dentro de tu módulo y expórtala desde `apps/api/src/modules/catalogos_configuracion/index.ts` para que otros módulos la importen.
- Consumidores de tu módulo: postulaciones (SNIES, declaraciones), auth (consentimiento), evaluacion/asignaciones (plazos en días hábiles).

## 2. Infraestructura existente (léela completa; es la base sobre la que debes encajar)

Proyecto: plataforma web del Fondo para la Educación Superior de Tocancipá (FOEST). Monorepo con npm workspaces (Node 22, TypeScript estricto). Supabase (PostgreSQL + Auth + Storage) es la persistencia y la autenticación; Node/Express es la capa de negocio/API; el frontend es **Vite + React 18 + react-router v6 + TanStack Query + Tailwind** (NO es Next.js: no generes `app/`, `pages/` de Next ni server components).

### 2.1 Árbol actual del proyecto (resumido a lo relevante; [X] = módulo ya existente)

```
.
├── package.json                 # workspaces: apps/*, packages/*. scripts: dev, build, typecheck, test, lint
├── tsconfig.base.json
├── README-DEV.md                # guía de desarrollo y convenciones (sección 6)
├── docs/                        # especificación funcional (SOLO LECTURA). docs/DECISIONES.md manda; su §19 fija Supabase
│   ├── DECISIONES.md  PENDIENTES.md  README.md  CAMBIOS_V2.md
│   └── modules/<modulo>.md      # el .md de tu módulo es uno de estos
├── packages/shared/             # @foest/shared: enums, permisos, esquemas Zod y tipos compartidos (build CJS+ESM)
│   └── src/ enums.ts  permisos.ts  api.ts  schemas.ts  index.ts  accounts/{accounts.types,accounts.schemas}.ts  postulaciones/{formulario.schema,transiciones,index}.ts
├── apps/api/                    # Express + TypeScript (CommonJS). Montado bajo /api/v1
│   ├── .env.example  jest.config.cjs  package.json  tsconfig.json
│   ├── scripts/ seed-admin.ts  verify-supabase.ts
│   └── src/
│       ├── app.ts  server.ts  config/env.ts
│       ├── shared/ index.ts  supabase.ts  auth.middleware.ts  rbac.matrix.ts  errors.ts  audit.ts  pagination.ts  validate.ts  logger.ts  types.ts
│       └── modules/
│           ├── index.ts                      # registro de routers (ver 2.6)
│           ├── ejemplo/                      # módulo de referencia (routes/controller/service/dto/types/__tests__)
│           ├── auth/              [X]  accounts/            [X]  roles_permissions/   [X]
│           ├── convocatorias/     [X]  postulaciones/       [X]  beneficiario_dashboard/ [X] (incluye notificaciones.routes.ts)
│           └── dashboard_funcionario/ [X]  admin_dashboard/ [X] (incluye auditoria/configuracion/festivos mínimos)
├── apps/web/                    # Vite + React 18 + TS
│   ├── .env.example  index.html  package.json  tailwind.config.ts  vite.config.ts  tsconfig.json
│   └── src/
│       ├── main.tsx  router.tsx  navigation.ts  index.css
│       ├── lib/ api.ts  supabase.ts  queryClient.ts  cn.ts  auth/{AuthProvider.tsx, ProtectedRoute.tsx}
│       ├── components/ui/ Button Input Select Textarea Checkbox Card Table Badge Alert Modal PageHeader EmptyState Spinner FormField (index.ts)
│       ├── components/layout/ AppShell.tsx  Header.tsx  Sidebar.tsx  Footer.tsx  PublicLayout.tsx
│       ├── pages/ ErrorPages.tsx (EnConstruccionPage, ForbiddenPage, NotFoundPage)  LandingPage.tsx (sin uso)
│       └── modules/
│           ├── index.ts                      # registro de rutas (ver 2.6)
│           ├── ejemplo/  auth/ [X]  accounts/ [X]  roles_permissions/ [X]  convocatorias/ [X]  postulaciones/ [X]
│           └── beneficiario_dashboard/ [X]  dashboard_funcionario/ [X]  admin_dashboard/ [X]
└── supabase/
    ├── README.md
    └── migrations/ 0001_base.sql 0002_auth.sql 0003_accounts.sql 0004_roles_permissions.sql 0005_convocatorias.sql 0006_postulaciones.sql 0008_dashboard_funcionario.sql 0009_admin_dashboard.sql   # (0007 no existe)
```

Módulos YA implementados (no los reescribas): auth, accounts, roles_permissions, convocatorias, postulaciones, beneficiario_dashboard, dashboard_funcionario, admin_dashboard.
Módulos PENDIENTES (uno por compañero): catalogos_configuracion, auditoria, notificaciones, documentos, formatos_oficiales, asignaciones, evaluacion, labor_social, seguimiento_beneficios, export_reports.

### 2.2 Convenciones de código

- Nombres de archivo en API: `apps/api/src/modules/<modulo>/{<modulo>.routes.ts, <modulo>.controller.ts, <modulo>.service.ts, <modulo>.dto.ts, <modulo>.types.ts}` (+ archivos auxiliares propios: `<modulo>.jobs.ts`, `ports/*.ts`, etc.). Controller traduce HTTP ↔ servicio sin reglas de negocio; service tiene las reglas y el acceso a datos; dto son esquemas Zod.
- Nombres en web: `apps/web/src/modules/<modulo>/{routes.tsx, api.ts, types.ts, pages/*.tsx, components/*.tsx, hooks/*.ts}`.
- Export obligatorio del router: `export const <modulo>Routes: Router` (un módulo puede exportar varios routers con nombres propios, p. ej. `convocatoriasPublicoRoutes`). Export obligatorio de rutas web: `export const <modulo>Routes: RutasModulo` con `{ rutasPublicas?, rutasBeneficiario?, rutasFuncionario?, rutasAdmin? }` (RouteObject[] RELATIVOS a `/`, `/beneficiario`, `/funcionario`, `/admin`).
- Cadena de middlewares en cada ruta: `authenticate()` → `requirePermission('recurso:accion')` → `validate({ body, query, params })` → controller. Solo las rutas de la lista cerrada de rutas públicas (DECISIONES §7) omiten `authenticate()`.
- Códigos de respuesta (regla única): 401 sin token; 403 si el ROL no tiene el permiso (o `CUENTA_INACTIVA`); **404 si el recurso es ajeno / no asignado / excluido (nunca 403)**; 409 conflicto de estado o versión; 422 datos inválidos o incompletos. Error siempre `{ code: string, message: string, details?: unknown }`. Éxito: JSON del recurso; listados paginados `{ data, page, page_size, total }` con query `?page=1&page_size=20` (máximo 100).
- Validación: Zod en todo body/query/params (reutiliza esquemas de `@foest/shared`). Tipado estricto, sin `any`.
- Fechas: `timestamptz` en BD; reglas de plazo en zona `America/Bogota`; días hábiles con la tabla `festivo` (hay funciones SQL `fn_es_dia_habil`, `fn_sumar_dias_habiles`, `fn_dias_habiles_entre` en 0009 y utilidades de fecha en `modules/convocatorias/convocatorias.fechas.ts`).
- Texto en español formal (usted). Sin emojis en código, UI ni mensajes.
- Diseño UI estricto: solo blanco `#ffffff`, azul `#238dc1` (clases Tailwind `primary`, `primary-10`, `primary-20`) y texto negro (`ink`). Ninguna otra clase de color compila (el theme reemplaza `colors`). Sin iconos decorativos. Errores y éxitos solo con texto y bordes (componente `Alert`). Acciones críticas con `Modal` de doble intención (confirmación explícita).

### 2.3 Piezas compartidas que DEBES reutilizar (no las recrees)

API — todo se importa desde `'../../shared'` (apps/api/src/shared/index.ts):
- `supabaseAdmin` (cliente service_role; solo operaciones de sistema: auditoría, jobs, cambios de rol, RPC `SECURITY DEFINER`) y `supabaseAsUser(accessToken)` (cliente con el JWT del usuario: RLS aplica; úsalo para lecturas/escrituras en nombre del usuario). `getSupabaseAdmin()`, `__setSupabaseAdminForTests()`.
- `authenticate()`: valida el Bearer con `supabase.auth.getUser`, carga `public.usuario`, rechaza `activo=false` (403 `CUENTA_INACTIVA`) y expone `req.user: UsuarioAutenticado = { id, email, rol, token }`. `usuarioActual(req)` devuelve `req.user` o lanza 401.
- `requirePermission(...codigos)` / `requireAnyPermission(...codigos)`: 403 `SIN_PERMISO` si el rol no tiene el permiso según `MATRIZ_PERMISOS` de `@foest/shared`. `tienePermiso(rol, permiso)`, `permisosDelRol(rol)`.
- `validate({ body?, query?, params? })` → 422 con `details` de Zod.
- `AppError` con fábricas: `AppError.noAutenticado()`, `.sinPermiso()`, `.cuentaInactiva()`, `.noEncontrado(code?, message?)`, `.conflicto(code, message, details?)`, `.datosInvalidos(code, message, details?)`, `.interno()`. `errorHandler` y `notFoundHandler` ya están montados en app.ts.
- `auditar(evento: EventoAuditoria): Promise<string>` inserta en `auditoria_evento` con `supabaseAdmin` y redacta automáticamente campos sensibles (contraseñas, tokens, cuentas). Campos: `{ actor_id?, actor_tipo?: 'USUARIO'|'SISTEMA'|'ANONIMO', actor_rol?, accion, entidad, entidad_id?, datos_antes?, datos_despues?, metadatos?, resultado?: 'EXITO'|'FALLO'|'DENEGADO', ip?, user_agent?, request_id?, sesion_id? }`. `contextoDesdeRequest(req)` devuelve actor/ip/user_agent/request_id listos para hacer spread. Si `auditar` falla, lanza: la operación debe fallar.
- `parsearPaginacion(req.query)`, `rangoSupabase(p)` → `{ desde, hasta }` para `.range()`, `paginar(data, p, total)`.
- `logger` (pino). `env` desde `apps/api/src/config/env.ts` (variables: NODE_ENV, PORT=4000, WEB_ORIGIN, LOG_LEVEL, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY; postulaciones añadió DATOS_PAGO_KEY y DATOS_PAGO_KEY_VERSION).
- Jobs programados: `node-cron` ya instalado; patrón usado: el módulo crea `<modulo>.jobs.ts` y arranca el cron desde su `routes.ts` solo si hay credenciales y `NODE_ENV !== 'test'`.

Shared (`@foest/shared`, packages/shared/src):
- Enums y esquemas: `Rol` (ADMINISTRADOR|FUNCIONARIO|BENEFICIARIO), `EstadoPostulacion` (BORRADOR, PENDIENTE, EN_EVALUACION, EN_CORRECCION, APROBADA, RECHAZADA, DESISTIDA; `ESTADOS_POSTULACION_TERMINALES`, `esEstadoTerminal`), `EstadoConvocatoria` (BORRADOR, HABILITADA, SUSPENDIDA, CERRADA, ARCHIVADA), `TipoSolicitud` (PRIMERA_VEZ, RENOVACION, REINTEGRO), `CodigoBeneficio` (S11, EA, DEP, CUL, SUP, ST, LE1..LE6) y `BENEFICIOS_CATALOGO`, `TipoDocumentoIdentidad` (CC, TI, CE, PS), `ActorTipo`, `MotivoTransicion`.
- `PERMISOS` (catálogo) y `MATRIZ_PERMISOS` (rol → permisos). Códigos existentes: administrador:consultar|estado, asignacion:bandeja|conflicto_interes|consultar|liberar|reasignar|tomar, auditoria:consultar|exportar, beneficiario:consultar|corregir_documento|editar_perfil|estado, catalogo:administrar|consultar, configuracion:consultar|editar, convocatoria:ampliar|archivar|comite|consultar|crear|deshabilitar|editar|habilitar|rehabilitar, dashboard:admin|beneficiario|funcionario, documento:consultar|eliminar|reemplazar|subir, evaluacion:consultar|dictaminar|revisar, formato:generar, funcionario:consultar|crear|editar|estado|restablecer_clave, habeas_data:gestionar|solicitar, labor_social:consultar|gestionar|registrar|validar, notificacion:administrar|consultar|marcar_leida, postulacion:consultar|crear|desistir|editar|eliminar_borrador|enviar|subsanar, reportes:descargar|solicitar, rol:consultar, seguimiento:consultar|desembolsar|revocar|suspender. Usa SOLO estos códigos. Si necesitas uno nuevo, no edites permisos.ts: decláralo en "Cambios requeridos en archivos compartidos" (hay que añadirlo en `packages/shared/src/permisos.ts`, en el bloque `-- BEGIN SEED rol_permiso` de `supabase/migrations/0001_base.sql` y en una migración nueva; una prueba automática verifica que los tres coincidan).
- `ApiError`, `HTTP`, `Paginado<T>`, `PaginacionQuerySchema`, `PAGE_SIZE_DEFECTO/MAXIMO`, `UuidSchema`, `IdParamSchema`, `PasswordSchema`, `EmailSchema`, `MotivoSchema` (mín. 15 caracteres), `ConfirmarSchema` (literal true), `VersionSchema`, `PeriodoSchema`, `FechaLocalSchema` (YYYY-MM-DD).
- Postulaciones: `formulario.schema.ts` (9 secciones del GE-F041, completo/parcial, `seccionesAplicables`), `transiciones.ts` (tabla de transiciones, `textoEstadoBeneficiario`).

Web (apps/web/src):
- `lib/api.ts`: `api.get/post/put/patch/delete<T>(path, body?, options?)` sobre `VITE_API_URL`; adjunta el Bearer de la sesión de Supabase y reintenta una vez ante 401 refrescando; errores como `ApiRequestError { status, code, message, details }`.
- `lib/supabase.ts`: cliente anon (solo para sesión/auth en el navegador; los datos van por la API).
- `lib/auth/AuthProvider.tsx`: `useAuth()` → `{ session, user, rol, loading, configurado, iniciarSesion, cerrarSesion, permisos?, forzarCambioClave?, recargarMe? }`; `rutaInicioPorRol(rol)`. `lib/auth/ProtectedRoute.tsx`: `<ProtectedRoute roles={[...]} />` (ya envuelve los árboles de rol en router.tsx; no lo uses dentro de tu módulo).
- `modules/roles_permissions/index.ts` exporta `usePermissions()` → `{ can(codigo), canAny(...), permisos, rol }` y `<RoleGuard>`.
- `components/ui` (import desde `'../../../components/ui'`): Button, Input, Select, Textarea, Checkbox, Card, Table (paginada), Badge, Alert, Modal (doble intención), PageHeader, EmptyState, Spinner, FormField (errores Zod). `components/layout`: AppShell (header institucional + Sidebar por rol + Footer legal), PublicLayout. `lib/queryClient.ts` (TanStack Query), `lib/cn.ts`.
- Módulos existentes con API pública reutilizable: `modules/convocatorias/api.ts` y `modules/postulaciones/api.ts` (funciones HTTP), `modules/beneficiario_dashboard` (campana `NotificacionesCampana` y páginas de notificaciones del beneficiario).

### 2.4 Esquema de base de datos actual (Supabase; migraciones SQL planas, sin ORM)

Convención: `supabase/migrations/NNNN_<modulo>.sql`, numeradas, **idempotentes** (`create table if not exists`, `create or replace function`, `drop policy if exists` + `create policy`), con RLS activo y políticas en cada tabla nueva, y `revoke execute ... from anon, authenticated` en funciones `security definer` que solo deba invocar la API (service_role). Las aplica una persona a mano desde el editor SQL de Supabase; no asumas que tu migración está aplicada durante el desarrollo.

Tablas existentes (0001_base.sql salvo indicación): `usuario` (id = auth.users.id, email, rol, activo, forzar_cambio_clave, ultimo_login; creada por trigger `on_auth_user_created`), `beneficiario` (usuario_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, es_menor, perfil_completo, dirección/contacto, estrato, sisben_categoria, sisben_puntaje, anonimizado), `acudiente`, `funcionario` (usuario_id, nombres, apellidos, cargo, dependencia, invitado_en [0003]), `consentimiento_datos`, `rol`, `permiso`, `rol_permiso` (seed de la matriz), `beneficio` (12 códigos), `convocatoria` (anio, semestre UNIQUE, nombre, descripcion, fecha_apertura, fecha_cierre_exclusiva, estado, motivo_suspension, version, creado_por), `convocatoria_beneficio` (cupos_estimados, presupuesto_asignado, valor_apoyo_referencial), `ampliacion_convocatoria`, `convocatoria_cambio_estado`, `asignacion_funcionario` (convocatoria_id, funcionario_id = usuario.id, asignado_en, asignado_por, retirado_en) = comité, `postulacion` (beneficiario_id, convocatoria_id, tipo_solicitud, estado, datos_formulario jsonb, correcciones_perfil, correccion_vigente, valor_matricula_letras, ciclo, version, aprobacion_parcial, fecha_limite_subsanacion, enviada_en; UNIQUE(beneficiario_id, convocatoria_id); trigger que impide salir de estados terminales), `postulacion_envio` (postulacion_id, ciclo, datos_formulario, perfil_snapshot, hash_envio, idempotency_key, enviado_en; inmutable), `postulacion_beneficio` (postulacion_id, beneficio_codigo), `historial_estado_postulacion` (postulacion_id, ciclo, estado_anterior, estado_nuevo, motivo, actor_tipo, actor_id, observaciones, cambiado_en), `declaracion_juramentada` (DECL_1..6, versionadas, texto PROVISIONAL), `notificacion` (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, url_destino, severidad INFO|ADVERTENCIA|CRITICA, leida, leida_en, clave_dedup, creada_en), `auditoria_evento` (secuencia, actor_id, actor_tipo, actor_rol, accion, entidad, entidad_id, resultado, datos_antes, datos_despues, metadatos, request_id, sesion_id, ip_origen, user_agent, hash_previo, hash_evento, registrado_en; append-only: REVOKE UPDATE/DELETE + trigger), `configuracion_sistema` (clave UNIQUE, valor, tipo, categoria, descripcion, valor_defecto, valor_min, valor_max, pendiente_confirmar, version, actualizado_por; seed de claves: ACUERDO_VIGENTE_CODIGO/TEXTO, MAX_TAMANO_ARCHIVO_MB, CUOTA_POSTULACION_MB, SUBSANACION_DIAS_HABILES(+_MAX), ALERTA_CIERRE_DIAS, ALERTA_SOBRECARGA_PENDIENTES, ALERTA_SOBRECARGA_DIAS_HABILES, ALERTA_ASIGNACION_SIN_MOVIMIENTO_DIAS_HABILES, KANON_UMBRAL, SESIONES_MAX, RECORDATORIO_BORRADOR_DIAS, RECORDATORIO_SUBSANACION_DIAS_HABILES, FECHA_PROXIMA_APERTURA_ESTIMADA, CONSENTIMIENTO_TEXTO_VERSION_VIGENTE, CONSENTIMIENTO_TEXTO [0002], PAGARE_REQUIERE_CODEUDOR_MENORES, RETENCION_DOCUMENTOS_ANIOS, RETENCION_AUDITORIA_ANIOS, RETENCION_NOTIFICACIONES_MESES, NOTIF_REINTENTOS_MAX, LABOR_SOCIAL_HORAS_MINIMAS, AMPLIACION_MOTIVO_MIN_CARACTERES, PERFIL_EDAD_MAYORIA, REGISTRO_VERIFICACION_EMAIL_HORAS), `festivo` (fecha, nombre, anio; seed 2026), `metricas_refresh`, `intento_login` [0002], `solicitud_habeas_data` [0003], `datos_pago_st` [0006; cifrado AES-256-GCM en Node], vistas materializadas `mv_postulacion_envio` y `mv_postulacion_beneficio` [0001/0008].
Funciones SQL existentes: `auth_rol()` (lee `app_metadata.rol` del JWT), `es_administrador()/es_funcionario()/es_beneficiario()`, `es_mi_beneficiario(uuid)`, `en_comite(convocatoria_id)`, `puede_leer_postulacion(uuid)`, `fn_transicionar_postulacion(...)` y `fn_enviar_postulacion(...)` [0006], `fn_refrescar_metricas()`, `fn_metricas_funcionario(...)` [0008], `fn_admin_*`, `fn_es_dia_habil`, `fn_sumar_dias_habiles`, `fn_dias_habiles_entre`, `fn_hoy_bogota`, `fn_config_int` [0009].
RLS vigente (resumen): el beneficiario lee/escribe solo lo propio; el funcionario lee lo de las convocatorias donde está en `asignacion_funcionario` (sin `retirado_en`); el administrador lee todo; las escrituras de sistema las hace la API con service_role (bypass). Auth: Supabase Auth; rol único por usuario en `auth.users.app_metadata.rol`, escrito solo desde la API.

Máquina de estados de postulación (dueño: módulo postulaciones; único punto de cambio: `postulacionService.transicionar(id, estadoNuevo, { actor, motivo, observaciones, versionEsperada, payload })` en `apps/api/src/modules/postulaciones/postulacion.service.ts`, que invoca `fn_transicionar_postulacion` y escribe historial y notificación in-app): BORRADOR → PENDIENTE (enviar) → EN_EVALUACION (tomar, módulo asignaciones) → APROBADA | RECHAZADA | EN_CORRECCION (dictamen, módulo evaluacion); EN_CORRECCION → PENDIENTE (subsanar) o → RECHAZADA (vence plazo, job); cualquiera no terminal → DESISTIDA. APROBADA, RECHAZADA y DESISTIDA son terminales. `version` es bloqueo optimista; `ciclo` sube en cada envío/subsanación.

### 2.5 Variables de entorno

`apps/api/.env` (ver .env.example): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (solo servidor), PORT, WEB_ORIGIN, LOG_LEVEL, NODE_ENV, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, DATOS_PAGO_KEY, DATOS_PAGO_KEY_VERSION, ADMIN_EMAIL, ADMIN_PASSWORD. `apps/web/.env`: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL. Si tu módulo necesita una variable nueva, léela desde `process.env` dentro de tu módulo con validación Zod propia y declárala en "Variables de entorno nuevas"; no edites `config/env.ts`.

### 2.6 Cómo se registra un módulo (lo hará quien integre; tú solo entregas el fragmento)

API — `apps/api/src/modules/index.ts` tiene `export const modulos: ModuloRegistrado[] = [ { prefijo: '/convocatorias', router: convocatoriasRoutes }, ... ]` y `registrarModulos(app, '/api/v1')`. Prefijos ya ocupados: /ejemplo, /auth, /roles, /permisos, /dashboard/admin, /auditoria, /configuracion, /festivos, /dashboard/funcionario, /funcionarios, /administradores, /beneficiarios, /habeas-data, /dashboard/beneficiario, /notificaciones, /convocatorias, /publico/convocatorias, /beneficios, /postulaciones.
Web — `apps/web/src/modules/index.ts` tiene `export const modulos: RutasModulo[] = [ authRoutes, ..., postulacionesRoutes ]` y `rutasDe(clave)`; `router.tsx` monta `rutasDe('rutasPublicas')` bajo `PublicLayout`, y `rutasDe('rutasBeneficiario'|'rutasFuncionario'|'rutasAdmin')` bajo `/beneficiario`, `/funcionario`, `/admin` con `AppShell` y `ProtectedRoute` por rol. Menú lateral: `apps/web/src/navigation.ts` (`NAVEGACION: Record<Rol, GrupoNavegacion[]>`); entradas ya previstas que tu módulo puede cubrir: BENEFICIARIO: /beneficiario, /beneficiario/perfil, /beneficiario/postulaciones, /beneficiario/notificaciones. FUNCIONARIO: /funcionario, /funcionario/bandeja, /funcionario/convocatorias, /funcionario/metricas, /funcionario/notificaciones. ADMINISTRADOR: /admin, /admin/convocatorias, /admin/postulaciones, /admin/asignaciones, /admin/funcionarios, /admin/beneficiarios, /admin/administradores, /admin/habeas-data, /admin/configuracion, /admin/festivos, /admin/auditoria, /admin/reportes, /admin/notificaciones, /admin/roles, /admin/roles/matriz.

## 3. Contrato de integración (obligatorio para que unir los archivos no genere conflictos)

- SÍ puedes crear código en: `apps/api/src/modules/<tu_modulo>/**`, `apps/web/src/modules/<tu_modulo>/**`, `packages/shared/src/<tu_modulo>/**` (nuevo subdirectorio propio) y `supabase/migrations/<tu_numero>_<tu_modulo>.sql`.
- NO modifiques: `apps/api/src/modules/index.ts`, `apps/api/src/shared/**`, `apps/api/src/app.ts`, `apps/api/src/config/env.ts`, `apps/web/src/modules/index.ts`, `apps/web/src/router.tsx`, `apps/web/src/navigation.ts`, `apps/web/src/lib/**`, `apps/web/src/components/**`, `packages/shared/src/index.ts`, `packages/shared/src/permisos.ts`, `packages/shared/src/enums.ts`, ningún archivo de otro módulo, `docs/**`, ni migraciones existentes. Si necesitas un cambio en alguno (registrar router/rutas/menú, reexportar desde shared/index.ts, nuevo permiso, nueva variable de entorno, nueva columna en tabla existente), NO lo edites: ponlo en la sección "Cambios requeridos en archivos compartidos" con el fragmento exacto a aplicar (diff o líneas a insertar y dónde).
- Dependencias hacia otros módulos: usa solo sus exports públicos ya existentes (los listados en 2.3 y 2.4 y los que encuentres en los archivos del módulo). Si dependes de un módulo que aún no existe, define un `port`/interfaz en `apps/api/src/modules/<tu_modulo>/ports/` con una implementación provisional claramente marcada `// PROVISIONAL(<modulo>)`, y lista la dependencia en "Dependencias pendientes".
- Nuevas dependencias npm: no las instales en el package.json compartido; lístalas aparte con nombre, versión y workspace (`npm install <pkg>@<version> -w apps/api|apps/web`).
- Numera tu migración con el número asignado en la sección 1 de este prompt. Asume aplicadas 0001–0009.

## 4. Alcance: solo desarrollo de código

- SÍ: backend (routes, controller, service, dto, types, jobs si aplica), frontend (routes, pages, components, hooks, api, types), tipos/esquemas compartidos en tu subcarpeta de shared, migración SQL con RLS, y toda la lógica de negocio del .md, usando `authenticate()` y `requirePermission()` existentes como parte normal de cada ruta.
- NO: pruebas unitarias ni de integración, QA, auditorías de seguridad, hardening, benchmarking, ni refactorizar o "mejorar" código de otros módulos o de la infraestructura. Eso se hace al final por separado.

## 5. Formato de entrega obligatorio (siempre en este orden)

1. Resumen breve de lo implementado y supuestos asumidos (incluye ambigüedades o contradicciones detectadas en el .md y cómo las resolviste).
2. Archivos creados y modificados: cada uno con su ruta completa relativa a la raíz del proyecto como encabezado y su código COMPLETO en un bloque de código separado (sin "..." ni fragmentos omitidos).
3. Árbol de carpetas actualizado mostrando cómo queda la arquitectura con el módulo integrado, marcando cada archivo con [NUEVO] o [MODIFICADO].
4. Cambios requeridos en archivos compartidos (fragmentos exactos: import + entrada en `apps/api/src/modules/index.ts`, entrada en `apps/web/src/modules/index.ts`, entradas en `navigation.ts`, reexport en `packages/shared/src/index.ts`, permisos nuevos, etc.).
5. Migraciones SQL y variables de entorno nuevas (si las hay), con el nombre de archivo asignado.
6. Pasos de integración: orden exacto en que copiar los archivos y qué registrar (router, rutas web, menú, shared, migración).
7. Dependencias pendientes con otros módulos (ports provisionales y qué debe reemplazarlos).
