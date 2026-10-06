# Decisiones Canónicas — Plataforma FOEST (v2)

Fuente de verdad compartida por todos los módulos. Si un módulo contradice este documento, **gana este documento**. Cada decisión corrige un hallazgo de la revisión de la v1 (inconsistencias, vacíos o errores técnicos).

---

## 1. Estructura del repositorio y convenciones

- Monorepo: `apps/api` (Express + Prisma), `apps/web` (React + Vite), `packages/shared` (esquemas Zod, enums, tipos compartidos).
- Rutas de archivos en los módulos: backend `apps/api/src/modules/<modulo>/…`, frontend `apps/web/src/modules/<modulo>/…`, compartido `packages/shared/src/<modulo>/…`.
- Infraestructura transversal en `apps/api/src/shared/` (`mailer`, `storage`, `audit`, `outbox`, `business-days`, `errors`, `crypto`).
- IDs `uuid`. Fechas `timestamptz` (UTC en BD; presentación y reglas en `America/Bogota`).
- Prefijo `/api/v1`. Error estándar: `{ code, message, details? }`. Paginación estándar: `?page=1&page_size=20` → `{ data, page, page_size, total }`.
- PostgreSQL administrado estándar (Supabase solo como hosting). **No se usa Supabase Auth.** Autenticación propia con JWT.
- Todo envío de correo pasa por **outbox transaccional** (ver `notificaciones.md`); ningún módulo llama al SMTP directamente.
- Todo evento auditable se registra con `auditar(tx, evento)` dentro de la misma transacción (ver `auditoria.md`).
- Días hábiles: utilidad `business-days` basada en la tabla `FESTIVO` (ver `catalogos_configuracion.md`). Toda mención a "días hábiles" usa esa utilidad.

## 2. Códigos de respuesta de acceso (regla única)

| Situación | Respuesta |
|---|---|
| Sin token / token inválido | `401` |
| Usuario inactivo | `403` `CUENTA_INACTIVA` |
| El **rol** no tiene el permiso | `403` |
| El rol tiene el permiso pero el recurso es **ajeno / no asignado / excluido** | `404` (oculta existencia) |
| Regla de negocio o estado no permite la acción | `409` (conflicto de estado/versión) o `422` (datos inválidos/incompletos) |

Ningún módulo puede usar `403` para recursos ajenos. Las pruebas de aceptación deben seguir esta tabla.

## 3. Roles y permisos

- Tres roles base: `ADMINISTRADOR`, `FUNCIONARIO`, `BENEFICIARIO`. `USUARIO.rol_id` es un **único** rol (se elimina `USUARIO_ROL`).
- El JWT lleva `sub`, `rol`, `jti`. **Los permisos no van en el token**: se resuelven en el servidor desde la matriz rol→permiso (caché en memoria, invalidada al cambiar el seed). Así un cambio de matriz aplica sin reautenticar.
- JWT firmado con **RS256** (algoritmo fijado en la verificación; se rechaza `none`/HS*).

## 4. Máquina de estados de Postulación (única definición)

Estados: `BORRADOR`, `PENDIENTE`, `EN_EVALUACION`, `EN_CORRECCION`, `APROBADA`, `RECHAZADA`, `DESISTIDA`.

| Desde | Hacia | Disparador | Actor |
|---|---|---|---|
| (nuevo) | `BORRADOR` | `POST /postulaciones` | Beneficiario |
| `BORRADOR` | (eliminado) | `DELETE /postulaciones/:id` (borrado físico, sin efectos legales) | Beneficiario |
| `BORRADOR` | `PENDIENTE` | `POST /postulaciones/:id/enviar` | Beneficiario |
| `PENDIENTE` | `EN_EVALUACION` | `POST /evaluacion/postulaciones/:id/tomar` (crea asignación activa) | Funcionario |
| `EN_EVALUACION` | `PENDIENTE` | `liberar` / conflicto de interés / reasignación (libera la asignación) | Funcionario / Admin |
| `EN_EVALUACION` | `APROBADA` | `POST …/dictamen` con al menos un beneficio aprobado | Funcionario |
| `EN_EVALUACION` | `RECHAZADA` | `POST …/dictamen` con todos los beneficios rechazados | Funcionario |
| `EN_EVALUACION` | `EN_CORRECCION` | `POST …/dictamen` con resultado `CORRECCION` (fija `fecha_limite_subsanacion`) | Funcionario |
| `EN_CORRECCION` | `PENDIENTE` | `POST /postulaciones/:id/subsanar` (nuevo ciclo) | Beneficiario |
| `EN_CORRECCION` | `RECHAZADA` | Vence `fecha_limite_subsanacion` (job del sistema, motivo `VENCIMIENTO_SUBSANACION`) | Sistema |
| `PENDIENTE`/`EN_EVALUACION`/`EN_CORRECCION` | `DESISTIDA` | `POST /postulaciones/:id/desistir` | Beneficiario |

Reglas:
- `APROBADA`, `RECHAZADA` y `DESISTIDA` son **terminales** (servicio + trigger de BD). **`RECHAZADA` no es subsanable**: lo subsanable va por `EN_CORRECCION`.
- La aprobación puede ser **parcial**: el dictamen se emite **por beneficio** (`REVISION_BENEFICIO`). `APROBADA` con `aprobacion_parcial = true` si algún beneficio fue rechazado.
- `POSTULACION.version` es un contador de **bloqueo optimista**: se incrementa en cada escritura que cambia estado, asignación o contenido enviado. El cliente debe enviarlo en dictámenes y subsanaciones.
- **Ciclo**: contador que arranca en 1 en el primer envío y suma 1 en cada `subsanar`. Cada envío genera un registro inmutable `POSTULACION_ENVIO` (ver `postulaciones.md`).
- El módulo `postulaciones` es **dueño** de la máquina de estados; `evaluacion`, `asignaciones` y los jobs la invocan a través de `postulacion.service.transicionar()`. `postulaciones` nunca importa de `evaluacion`.

## 5. Convocatorias

- Estados: `BORRADOR`, `HABILITADA`, `SUSPENDIDA`, `CERRADA`, `ARCHIVADA`.
- Transiciones: `BORRADOR→HABILITADA` (habilitar), `HABILITADA→SUSPENDIDA` (deshabilitar) y `SUSPENDIDA→HABILITADA` (rehabilitar), `HABILITADA→CERRADA` (cron y cálculo en tiempo real), `CERRADA→HABILITADA` (solo por **ampliación** con motivo, antes de archivar), `CERRADA→ARCHIVADA` (`archivar`, solo si todas las postulaciones están en estado terminal).
- Estado operativo "abierta" = `estado = HABILITADA AND fecha_apertura <= now < fecha_cierre_exclusiva`. `fecha_cierre` se presenta como 23:59:59 locales; internamente se guarda el instante exclusivo del día siguiente 00:00 `America/Bogota`.
- `UNIQUE(anio, semestre)`: una convocatoria por período. (Pendiente de confirmar si deben existir convocatorias paralelas por línea; ver `PENDIENTES.md`.)
- `CONVOCATORIA_BENEFICIO` incluye `cupos_estimados`, `presupuesto_asignado` y `valor_apoyo_referencial`.

## 6. Catálogo de beneficios (único)

`S11`, `EA`, `DEP`, `CUL`, `SUP`, `ST`, `LE1`, `LE2`, `LE3`, `LE4`, `LE5`, `LE6`. Los códigos `AS`, `AM`, `AI` **no existen** y se eliminan de todos los modelos. Cualquier ampliación del catálogo se hace por seed/migración en `BENEFICIO`.

## 7. Cuentas, autenticación y consentimiento

- Una sola definición de `USUARIO` (en `auth.md`): `id, email, password_hash, rol_id, email_verificado, activo, forzar_cambio_clave, ultimo_login, creado_en, actualizado_en`.
- **Alta de funcionarios por invitación** (sin contraseña temporal por correo): el Administrador crea el funcionario → se genera `INVITACION` (token de un solo uso, hash en BD, vigencia 72 h) → el funcionario abre el enlace y define su contraseña (`POST /auth/invitacion/aceptar`), lo que marca `email_verificado = true`. `forzar_cambio_clave` se usa solo cuando el Administrador restablece manualmente una cuenta.
- Primer administrador: script `npm run seed:admin` con variables de entorno (no hay endpoint público).
- Endpoints de auth añadidos: `POST /auth/password/change` (autenticado), `POST /auth/verify-email/resend`, `POST /auth/invitacion/aceptar`. `POST /auth/logout` funciona con el refresh token de la cookie aunque el access token esté vencido.
- **Rutas públicas (lista cerrada)**: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/verify-email/*`, `/auth/invitacion/aceptar`, `GET /publico/convocatorias` (+ `/:id`), `GET /publico/verificar/:codigo`, `GET /catalogos/consentimiento/vigente` (texto de consentimiento para el registro) y `POST /notificaciones/webhooks/correo` (webhook del proveedor de correo, autenticado por firma HMAC, no por JWT). Todo lo demás exige `authenticate()`.
- **Rotación de refresh token con ventana de gracia**: si llega un refresh token ya rotado dentro de 10 s desde su reemplazo (pestañas concurrentes) se responde `409 REFRESH_CONCURRENTE` sin revocar; fuera de la ventana se considera reuso: se revocan todas las sesiones y se audita `REFRESH_REUSO`.
- **Fuerza bruta con dos contadores independientes**: por IP (20 intentos/15 min → `429`) y por email (5 fallos/15 min → bloqueo de ese email 15 min y aviso por correo al titular). Rate limit también en `/auth/register`, `/auth/password/forgot`, `/auth/verify-email/resend` y `…/upload-url`.
- Contraseña: 8–64 caracteres (límite por bcrypt), una mayúscula, un número y un carácter especial.
- **Consentimiento de tratamiento de datos (Ley 1581)**: tabla `CONSENTIMIENTO_DATOS` (usuario, versión del texto vigente, fecha, IP; para menores de edad, datos del acudiente). El registro no se completa sin aceptarlo.
- Despliegue: SPA y API bajo el mismo sitio (`app.<dominio>` / `api.<dominio>`) para que la cookie `SameSite=Strict` funcione; CORS con `credentials` solo para ese origen.

## 8. Asignación de expedientes (nuevo módulo `asignaciones`)

- Dos niveles: **comité de la convocatoria** (`ASIGNACION_FUNCIONARIO`, existente) y **asignación por expediente** (`POSTULACION_ASIGNACION`: `ACTIVA` | `LIBERADA`, una sola `ACTIVA` por postulación).
- El funcionario ve en su **bandeja** un resumen mínimo (sin datos sensibles) del *pool* de postulaciones `PENDIENTE` de sus convocatorias y sus asignaciones propias. El **expediente completo** solo se abre sobre una asignación `ACTIVA` propia (o histórica propia, en solo lectura). Cualquier otro caso → `404`.
- `tomar` crea la asignación y pasa a `EN_EVALUACION`. Solo el titular de la asignación activa puede dictaminar (otro funcionario → `404`; carrera entre dos que toman a la vez → el segundo recibe `409`).
- **Conflicto de interés**: libera la asignación, registra el impedimento y **excluye** a ese funcionario de esa postulación (no la vuelve a ver, `404`).
- **Reasignación** solo por Administrador: individual y masiva (al deshabilitar un funcionario). Se audita. Una asignación sin movimiento durante X días hábiles (configurable) genera alerta.

## 9. Evaluación (resumen de contrato)

- Un único endpoint de dictamen: `POST /evaluacion/postulaciones/:id/dictamen` con `{ version, confirmar: true, resultado: APROBAR | RECHAZAR | CORRECCION, beneficios: [{codigo, decision: APROBADO|RECHAZADO, motivo, monto_aprobado?}], observaciones, campos_observados?, documentos_observados? }`.
- Chequeo documental **por tipo de documento** (`REVISION_DOCUMENTO.tipo_id`, con `documento_id` y `documento_version` nulos si el soporte nunca se cargó), lo que permite `NO_PRESENTA` sobre un soporte ausente.
- Un único vocabulario de revisión documental: `PRESENTA | NO_PRESENTA | NO_APLICA`. Se elimina `DOCUMENTO.estado_revision`; el badge del beneficiario se deriva del chequeo del último ciclo (`PRESENTA`→Aprobado, `NO_PRESENTA`→Por corregir, sin chequeo→Pendiente).
- Aprobar un beneficio exige que todos los documentos obligatorios de **ese beneficio** (según `REQUISITO_DOCUMENTO`) estén `PRESENTA` o `NO_APLICA`.
- Observaciones mínimas de 15 caracteres en `RECHAZAR` y `CORRECCION` y por cada beneficio rechazado.
- Anonimato del evaluador: los DTO hacia el beneficiario se construyen con un serializador explícito sin campos de actor (`ObservacionPublica`); el correo usa plantilla fija firmada "Equipo FOEST". El actor real se conserva internamente y en auditoría.

## 10. Subsanación

- `fecha_limite_subsanacion` se fija al emitir `CORRECCION`: `now + CONFIG.SUBSANACION_DIAS_HABILES` días hábiles (default 5, editable por el funcionario hasta un máximo configurable).
- La subsanación puede corregir **documentos** y **solo los campos** listados en `campos_observados` (del formulario o del perfil). Si se corrige un campo de perfil, el nuevo envío genera un nuevo `perfil_snapshot`; los anteriores permanecen intactos.
- Reemplazo y eliminación de documentos: solo en `BORRADOR` o en `EN_CORRECCION` dentro del plazo. Desde `PENDIENTE`, `EN_EVALUACION` o estados terminales: `409`.
- Reglas de ciclo: cada `subsanar` aumenta `ciclo` y crea un nuevo `POSTULACION_ENVIO`.

## 11. Documentos y formatos firmados

- Subida con **POST prefirmado** (`createPresignedPost`) con condición `content-length-range` y `Content-Type` fijados, de modo que el límite de tamaño lo impone S3, no el cliente.
- El **SHA-256 lo calcula el servidor** leyendo el objeto (≤ 10 MB) en `confirmar`; el hash del cliente solo se usa como verificación cruzada opcional.
- Al confirmar: validación de *magic numbers* (`file-type`), inspección de PDF (`pdf-lib`: sin cifrado ni JavaScript) y **escaneo antivirus** (ClamAV) asíncrono.
- `DOCUMENTO.estado_carga`: `SUBIENDO` → `ESCANEANDO` → `DISPONIBLE` | `RECHAZADO_ARCHIVO`. Solo `DISPONIBLE` cuenta para validación y se puede previsualizar. Registros en `SUBIENDO` > 24 h se purgan por job (objeto y fila).
- Lectura por URL prefirmada de 300 s tras verificar alcance; **cada entrega de URL se audita** (`DESCARGA_DOCUMENTO`).
- La matriz `REQUISITO_DOCUMENTO` (qué soporte exige cada beneficio y tipo de trámite) se publica completa como **seed inicial propuesta** en `documentos.md` (sujeta a validación contra el Acuerdo 023).
- **Formatos que se firman a mano (GE-F041 y GE-F043)** los genera el módulo `formatos_oficiales` (P1, antes del envío). Cada generación guarda un `hash_contenido` calculado sobre los datos del formulario y del perfil usados. Al subir `FORM_INS` y `PAG_CART` se vinculan a su `formato_generado_id`. En `/enviar`, si el `hash_contenido` actual de la postulación difiere del de los formatos vinculados → `422 FORMATOS_DESACTUALIZADOS` (hay que regenerar y firmar de nuevo).
- **Verificación de autenticidad**: el PDF imprime un `codigo_verificacion` aleatorio (128 bits) en QR. El SHA-256 del **archivo final** se guarda en BD (`FORMATO_GENERADO.sha256_archivo`), nunca dentro del propio archivo. `GET /publico/verificar/:codigo` devuelve solo `{ valido, tipo, generado_en, sha256 }`, sin datos personales.

## 12. Datos sensibles

- Datos de pago del subsidio de transporte (cuenta/billetera): **cifrado a nivel de campo** (AES-256-GCM, clave por entorno/KMS), almacenados con `ultimos4` en claro para mostrar enmascarado. Evaluadores ven solo enmascarado; el descifrado completo solo ocurre en `seguimiento_beneficios` para desembolsos, con auditoría.
- Acceso a datos sensibles (perfil, SISBEN, documentos, exportaciones) genera eventos `LECTURA_SENSIBLE` / `DESCARGA_DOCUMENTO` / `EXPORTACION` en la auditoría.
- Perfil y SISBEN/estrato viven **solo** en `BENEFICIARIO` y entran al `perfil_snapshot`. La Sección 3 del formulario conserva únicamente lo que no es perfil (personas a cargo, situación laboral, contacto de emergencia).
- Menores de edad: `BENEFICIARIO.es_menor` se deriva de `fecha_nacimiento`; exigen datos de acudiente. El formato GE-F043 incluye bloque de **codeudor/acudiente** controlado por `CONFIG.PAGARE_REQUIERE_CODEUDOR_MENORES` (pendiente de validación jurídica).
- Retención de documentos eliminados lógicamente: `CONFIG.RETENCION_DOCUMENTOS_ANIOS` (valor a definir por jurídica).

## 13. Notificaciones

- `NOTIFICACION` es para **cualquier usuario** (beneficiario, funcionario, administrador), no solo beneficiarios.
- Correo con **outbox transaccional**: se inserta `EVENTO_OUTBOX` en la misma transacción; un worker BullMQ lo envía con reintentos y backoff. Siempre a correo principal y correo alternativo/acudiente cuando aplique.
- Recordatorios programados (job): borrador próximo a cierre, subsanación por vencer, convocatoria por cerrar (a staff), reporte listo.

## 14. Post-aprobación (nuevo módulo `seguimiento_beneficios`)

- `OTORGAMIENTO` (por postulación y beneficio): `ACTIVO | SUSPENDIDO | REVOCADO | CUMPLIDO`, con `monto_aprobado`. Se crea al dictaminar la aprobación de cada beneficio.
- `DESEMBOLSO`: `PROGRAMADO | PAGADO | ANULADO`, con referencia de pago.
- Revocación/suspensión solo por Administrador con motivo y auditoría; la plataforma **no diligencia el pagaré**, solo registra la pérdida del apoyo y notifica.
- Elegibilidad por tipo de trámite (parametrizable, a confirmar con el Acuerdo): `RENOVACION` requiere un `OTORGAMIENTO` previo `ACTIVO` o `CUMPLIDO` en la convocatoria anterior; `REINTEGRO` requiere un `OTORGAMIENTO` previo no `REVOCADO` y al menos un período sin apoyo. Se valida al crear la postulación.
- Métricas "montos" y ocupación de cupos/presupuesto salen de `OTORGAMIENTO`.

## 15. Métricas

- Se elimina el cálculo de percentiles dentro de la vista materializada original (no es re-agregable y duplicaba filas).
- Vista materializada `mv_postulacion_envio` con **grano un registro por `(postulacion_id, ciclo)`**, índice único para `REFRESH MATERIALIZED VIEW CONCURRENTLY`, refresco cada 5 min por job; se guarda `refrescada_en` en `METRICAS_REFRESH` y la UI muestra "Datos actualizados a hh:mm:ss".
- Los conteos usan `COUNT(DISTINCT postulacion_id)`; promedio y p90 se calculan **en consulta** sobre filas de grano postulación/ciclo ya filtradas. Tiempo de revisión = `decidida_en − enviado_en` del mismo ciclo (horas naturales).
- Desglose por beneficio usa una MV auxiliar `mv_postulacion_beneficio` (grano `(postulacion_id, beneficio_codigo)`); nunca se suman sus filas para obtener totales de postulaciones.
- K-anonimato (umbral `CONFIG.KANON_UMBRAL`, 5): celdas menores se agrupan en "Otros / Casos aislados" con **supresión complementaria** cuando la resta del total permitiría deducirlas.
- El funcionario ve su propia carga y el promedio del comité; la comparativa nominal por evaluador es solo del Administrador.
- Hay un único mecanismo de exportación: reportes asíncronos de `export_reports`. Se elimina `/dashboard/funcionario/exportar`.

## 16. Módulos y fases

| Fase | Módulos |
|---|---|
| **P0 – Fundaciones** | monorepo, CI, `shared/*`, `catalogos_configuracion`, `auditoria`, `notificaciones` |
| **P1 – Núcleo de solicitud** | `auth`, `accounts`, `roles_permissions`, `convocatorias`, `documentos`, `formatos_oficiales`, `postulaciones` |
| **P2 – Evaluación y seguimiento** | `asignaciones`, `evaluacion`, `labor_social`, `seguimiento_beneficios`, `beneficiario_dashboard`, `dashboard_funcionario`, `admin_dashboard` |
| **P3 – Reportes** | `export_reports` (resumen, consolidados, jobs asíncronos) |

Grafo de dependencias (sin ciclos; la flecha indica "usa a"):
`auditoria`, `notificaciones`, `catalogos_configuracion` ← todos.
`auth` → `accounts`(lectura de estado) · `accounts` → `auth`(revocación de sesiones) es la única dependencia bidireccional permitida y se resuelve con un servicio `SessionService` en `auth`.
`convocatorias` → `accounts`. `documentos` → `convocatorias`, `postulaciones`(lectura de estado). `formatos_oficiales` → `postulaciones`, `documentos`, `accounts`. `postulaciones` → `convocatorias`, `accounts`, `documentos`, `formatos_oficiales`, `seguimiento_beneficios`(elegibilidad).
`asignaciones` → `postulaciones`, `convocatorias`. `evaluacion` → `asignaciones`, `postulaciones`, `documentos`, `seguimiento_beneficios`. `labor_social` → `accounts`, `postulaciones`. Dashboards y `export_reports` solo leen.

## 17. Calidad, operación y seguridad transversal

- Pruebas: unitarias + integración (Jest/Supertest), **matriz de acceso** automática rol×endpoint, E2E de los flujos críticos con Playwright (registro→postulación→evaluación→aprobación), pruebas de carga de dashboards con k6 (objetivo de latencia < 1 s con caché).
- CI: lint, typecheck, pruebas, `prisma migrate diff` y escaneo de dependencias en cada PR.
- Observabilidad: logs estructurados con `request_id`, métricas básicas (latencia, errores, tamaño de cola BullMQ), alertas sobre cola atascada y fallos de correo.
- Respaldos: copia diaria de BD con restauración probada; versionado de bucket S3; los objetos eliminados lógicamente no se purgan antes de la retención.
- Secretos fuera del repositorio (`.env` por entorno); rotación de claves JWT por `kid`.

---

## 18. Adiciones surgidas al redactar los módulos

Decisiones tomadas durante la redacción que complementan las secciones anteriores. Quedan como parte de la fuente de verdad.

- **Puertos para respetar el grafo de §16 (sin ciclos):** `ReasignacionPendientePort` (definido en `accounts`, implementado por `asignaciones`), `FormatosVigenciaPort` (definido en `postulaciones`, implementado por `formatos_oficiales`), `ElegibilidadPort` (definido en `postulaciones`; implementación provisional en P1 que siempre permite `PRIMERA_VEZ` y valida lo demás con reglas mínimas hasta que exista `seguimiento_beneficios` en P2) y `ExpedienteAccessPolicy` (implementada por `asignaciones`; la usan `documentos` y `formatos_oficiales`). `ResolverDestinatarios` y `ReminderSource` desacoplan `notificaciones` de los módulos de negocio.
- **Lectura de labor social por `evaluacion`:** `evaluacion → labor_social` (solo lectura) se agrega al grafo de §16. El resolutor de `GET /publico/verificar/:codigo` reconoce tanto `FORMATO_GENERADO` como `LABOR_SOCIAL_EMISION`.
- **Acceso al expediente:** `GET /postulaciones/:id` es solo para `BENEFICIARIO` (propio) y `ADMINISTRADOR` (lectura auditada). El funcionario accede al expediente únicamente por `evaluacion` con asignación propia.
- **Retiro de un funcionario del comité con expedientes activos:** la petición debe indicar `asignaciones: LIBERAR | MANTENER`; sin ese campo responde `409 ASIGNACIONES_PENDIENTES` con la lista de afectados. No se puede dejar vacío el comité de una convocatoria `HABILITADA` con expedientes en curso.
- **Consulta de auditoría** vive en `/auditoria` (no en el dashboard); el dashboard administrador solo tiene el visor.
- **Cupos y presupuesto:** superarlos no bloquea el dictamen; el primer desembolso exige `confirmar_excedente`. Cumplir un otorgamiento con desembolsos pendientes exige `forzar: true`.
- **Claves de configuración:** el máximo de días de subsanación es `SUBSANACION_DIAS_HABILES_MAX` (nombre único). El catálogo completo está en `catalogos_configuracion.md`.
- **Rutas públicas adicionales:** `GET /catalogos/consentimiento/vigente` y `POST /notificaciones/webhooks/correo` (firma HMAC), ya incluidas en §7.
- **Texto oficial de declaraciones:** el envío de postulaciones queda bloqueado hasta que el catálogo `DECLARACION_JURAMENTADA` tenga cargado el texto oficial del GE-F041 (ver `PENDIENTES.md` #5).
