# Base de datos FOEST (Supabase)

Proyecto: `https://kixjejmewgynzrppowfv.supabase.co`

Las migraciones son SQL plano en `supabase/migrations/NNNN_nombre.sql` (sin Prisma). Se aplican en orden numerico y son idempotentes donde PostgreSQL lo permite, de modo que volver a ejecutarlas no rompe nada.

## Como aplicar

### Opcion A - Editor SQL del proyecto (sin instalar nada)

1. Abra el proyecto en https://supabase.com/dashboard -> **SQL Editor** -> **New query**.
2. Pegue el contenido completo de `supabase/migrations/0001_base.sql` y ejecute (**Run**).
3. Repita con cada migracion siguiente en orden.
4. Verifique desde la API: `npm run verify:supabase -w apps/api` (requiere `apps/api/.env`).

### Opcion B - Supabase CLI (recomendada para el equipo)

No instalar globalmente; usar `npx`:

```bash
npx supabase login                       # una vez; pide el access token personal
npx supabase link --project-ref kixjejmewgynzrppowfv
npx supabase db push                     # aplica supabase/migrations/* pendientes
```

`npx supabase db push` registra que migraciones ya se aplicaron (tabla `supabase_migrations.schema_migrations`). Si una migracion ya se ejecuto manualmente con la opcion A, marquela como aplicada con `npx supabase migration repair --status applied 0001`.

## Despues de aplicar

1. Crear el primer administrador (no hay endpoint publico):
   ```bash
   # en apps/api/.env: ADMIN_EMAIL=... ADMIN_PASSWORD=...
   npm run seed:admin -w apps/api
   ```
2. Verificar: `npm run verify:supabase -w apps/api` imprime conexion, tablas y estado de RLS.

## Que crea `0001_base.sql`

- Extensiones `pgcrypto`, `pg_trgm`, `unaccent`.
- Enums: `rol_usuario`, `estado_postulacion`, `estado_convocatoria`, `tipo_solicitud`, `categoria_beneficio`, `tipo_documento_identidad`, `actor_tipo`, `tipo_ampliacion`, `origen_cambio_estado`, `severidad_notificacion`.
- Funciones: `auth_rol()`, `es_administrador()`, `es_funcionario()`, `es_beneficiario()`, `es_mi_beneficiario(uuid)`, `en_comite(uuid)`, `puede_leer_postulacion(uuid)`, `fn_estado_rls()`, `fn_refrescar_metricas()`, `handle_new_user()`, `handle_auth_user_updated()`, `fn_set_actualizado_en()`, `fn_bloquear_modificacion()`, `fn_postulacion_estado_terminal()`.
- Triggers: `on_auth_user_created` y `on_auth_user_updated` sobre `auth.users`; `trg_*_actualizado_en`; inmutabilidad de `postulacion_envio`, `consentimiento_datos` y `auditoria_evento`; bloqueo de salida de estados terminales en `postulacion`.
- Tablas (todas con RLS): `rol`, `permiso`, `rol_permiso`, `usuario`, `beneficiario`, `acudiente`, `funcionario`, `consentimiento_datos`, `beneficio`, `convocatoria`, `convocatoria_beneficio`, `ampliacion_convocatoria`, `convocatoria_cambio_estado`, `asignacion_funcionario`, `postulacion`, `postulacion_envio`, `postulacion_beneficio`, `historial_estado_postulacion`, `declaracion_juramentada`, `configuracion_sistema`, `festivo`, `notificacion`, `auditoria_evento`, `metricas_refresh`.
- Vistas materializadas `mv_postulacion_envio` y `mv_postulacion_beneficio` (con indices unicos para `REFRESH ... CONCURRENTLY`). Hasta que exista el modulo `evaluacion`, las columnas que dependen de `revision`/`revision_beneficio` quedan en `NULL`/`SIN_DECISION`; esa migracion debe recrearlas.
- Seeds: 3 roles, catalogo de permisos y matriz `rol_permiso` (identica a `MATRIZ_PERMISOS` de `@foest/shared`), 12 beneficios, 24 claves de `configuracion_sistema`, 18 festivos de Colombia 2026 y 6 declaraciones juramentadas marcadas `PROVISIONAL` (`texto_oficial_confirmado = false`).

## Reglas para nuevas migraciones

- Numerar secuencialmente: `0002_<modulo>.sql`, `0003_...`.
- Un modulo solo crea sus propias tablas; si necesita columnas en tablas de otro modulo, lo coordina con el dueno.
- Toda tabla nueva: `enable row level security` + politicas (beneficiario propio / funcionario comite o asignacion / administrador lectura). Las escrituras de sistema van por `service_role` desde la API.
- Cambios en la matriz de permisos: editar `packages/shared/src/permisos.ts` **y** el bloque `-- BEGIN SEED rol_permiso ... -- END SEED rol_permiso` (la prueba `apps/api/src/__tests__/rbac.test.ts` falla si difieren). El bloque puede copiarse integro a una migracion nueva, ya que es idempotente (borra y reinserta).
- Nunca poner secretos en migraciones.
