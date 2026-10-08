# Verificacion integral contra la base real (FOEST)

Fecha de ejecucion: 7 de octubre de 2026 (hora de Colombia). Alcance: recorrido HTTP real contra la API local y la base Supabase del proyecto, mas recorrido de navegador sobre la web local. No se hicieron commits. No se editaron migraciones 0001 a 0020.

## 1. Resumen ejecutivo

- Resultado global: el recorrido avanza de forma correcta hasta el borrador completo (perfil, convocatoria, formulario, 10 soportes, formatos GE-F041/GE-F043, labor social GE-F038, reportes y dashboards), pero el **envio de la postulacion falla con HTTP 500** por un defecto de SQL (D-01). Sin envio no existen expedientes PENDIENTE, por lo que los pasos 6 (parcial), 7, 8 y 9 quedaron BLOQUEADOS y los pasos 11 y 12 solo se comprobaron sin filas de datos.
- Se escribio `supabase/migrations/0021_correcciones_verificacion.sql` (idempotente) con dos correcciones. **Debe aplicarse** en Supabase para desbloquear el recorrido; luego deben repetirse los pasos 6 a 9.
- Defectos de codigo corregidos en esta sesion: D-02 (acceso del comite a expedientes ajenos) y D-04 (claves repetidas en React).
- `npm run typecheck`, `npm run build` y `npm test` en la raiz terminan en verde (api: 18 suites, 1064 pruebas; web: 15 archivos, 39 pruebas; shared: 3 pruebas).

## 2. Entorno

| Elemento | Valor |
| --- | --- |
| API propia | `tsx src/server.ts` en el puerto 4150 (sin modo watch), `RATE_LIMIT_MAX=5000`, `WEB_ORIGIN=http://localhost:5190` |
| `DATOS_PAGO_KEY` | clave aleatoria generada solo para el proceso de la API; no se escribio en ningun `.env` |
| Web propia | Vite en el puerto 5190 con `VITE_API_URL=http://localhost:4150/api/v1` |
| Base de datos | proyecto Supabase real; migraciones 0001 a 0020 aplicadas por el usuario |
| Usuarios de prueba | `verif.admin@foest.test`, `verif.func1@foest.test`, `verif.func2@foest.test`, `verif.ben@foest.test`, `verif.ben2@foest.test` (este ultimo para autorizacion cruzada) |
| Contrasena | aleatoria, solo en un archivo del scratchpad de la sesion; nunca impresa |
| Cliente de navegador | Chromium via puppeteer (contextos incognito por rol) y el navegador integrado; capturas en `docs/qa/verif-*.png` |

Observacion de entorno: el archivo `apps/api/.env` tiene un espacio inicial en los valores de `SUPABASE_*` (` eyJ...`). `dotenv`/`--env-file` lo tolera, pero cualquier lector manual del archivo debe aplicar `trim`.

Confirmacion de `fn_asignacion_bandeja`: la respuesta PGRST202 era un falso positivo de firma. La funcion exige `p_funcionario` (0016_asignaciones.sql, lineas 261 a 269) y llamada desde la API con sus parametros responde 200 (`GET /asignaciones/bandeja` devuelve `{data:[],total:0}` para func1 y func2).

## 3. Resultados por paso (API)

| Paso | Resultado | Evidencia |
| --- | --- | --- |
| 1. Health y 401 | PASA | `GET /health` 200 con `supabase:"ok"`; 7 rutas protegidas sin token responden 401. |
| 2. Convocatoria | PASA | Se creo "Verificacion integral 2027-1" (SUP y ST con cupos y presupuesto) con 201; habilitar sin comite da 422 `SIN_COMITE`; tras agregar func1 y func2 al comite, habilitar da 200; aparece en `GET /publico/convocatorias`. |
| 3. Perfil, postulacion, formulario | PASA | `PUT /beneficiarios/me` 200; consentimiento 201; RENOVACION sin apoyo previo da 422 `TRAMITE_NO_ELEGIBLE`; PRIMERA_VEZ 201; `PUT` con secciones 3, 4, 5, 7, 8 y 9 y datos de pago 200 (numero enmascarado `•••• 1234`); `PUT` con version vieja da 409 `VERSION_CONFLICTO`; `GET /validacion` reporta secciones completas. |
| 4. Documentos | PASA | Requisitos (10 exigibles) y tipos (13) correctos; 8 soportes ordinarios subidos con URL firmada (FormData con `cacheControl`, metodo y cabeceras de la respuesta), confirmados (202) y DISPONIBLE en unos 7 s. Un `.exe` renombrado a `.pdf` (version 3), un PDF con JavaScript (version 4) y un PDF cifrado (version 5) dan 422 al confirmar y la version queda RECHAZADO_ARCHIVO con motivo; la version vigente se conserva y el beneficiario recibe la notificacion "Soporte rechazado". `GET /documentos/:id/url` entrega un PDF valido (200, `%PDF-`). Nota: la regla `TIPO_NO_EXIGIBLE` impide usar CERT_NOT en PRIMERA_VEZ, por eso las pruebas de rechazo se hicieron como reemplazos de DOC_ID. |
| 5. Formatos | PASA | GE-F041 (3 paginas, 142 743 bytes) y GE-F043 (2 paginas, 110 195 bytes) generados con 201; descarga firmada con cabecera `%PDF-` y tamano igual al registrado; `GET /publico/verificar/:codigo` devuelve exactamente `valido, tipo, generado_en, sha256`; el sha256 publico coincide con el del archivo descargado (no con `hash_contenido`, que es el hash del contenido logico); codigo inexistente da 200 `{valido:false}`. FORM_INS y PAG_CART se subieron con `formato_generado_id` y quedaron DISPONIBLE. `validacion` pasa a `completo:true`. |
| 6. Envio | **FALLA** (D-01) | `POST /postulaciones/:id/enviar` sin `confirmar` da 422 (correcto); con `confirmar:true` e `Idempotency-Key` da **500** `function digest(bytea, unknown) does not exist`; la repeticion con la misma llave y con otra llave da el mismo 500. No se pudieron comprobar PENDIENTE, historial de envio, notificacion de envio ni fila de outbox de envio. Requiere 0021. |
| 7. Asignaciones | BLOQUEADO (parcial) | Dependen del paso 6. Verificado: `GET /asignaciones/bandeja` responde 200 para func1 y func2 (pool vacio) y 403 para el beneficiario; `GET /asignaciones/alertas` y `/evaluadores` 200. Sin comprobar: resumen minimo sin nombre/documento/SISBEN, tomar, YA_ASIGNADA. |
| 8. Evaluacion | BLOQUEADO | Depende del envio. `GET /evaluacion/postulaciones/:id` sobre un BORRADOR da 404 para func1 (pantalla "Expediente no disponible"). Sin comprobar: chequeo, dictamen CORRECCION/APROBAR, anonimato "Equipo FOEST", subsanacion, VERSION_CONFLICTO, 422 por documento NO_PRESENTA, asignacion liberada. |
| 9. Seguimiento | BLOQUEADO (parcial) | Sin otorgamientos. Verificado en vacio: `GET /seguimiento/otorgamientos` 200 (lista vacia), `/cupos` 200 con 6 filas (incluye mis 2 beneficios 2027-1: 50 cupos y $100.000.000 SUP, 50 cupos y $20.000.000 ST), `/mis-otorgamientos` 200 `[]`; `fn_cupos_ocupacion` funciona. Sin comprobar: desembolsos, pago, tope del monto aprobado, suspender/reactivar, carga masiva dry_run, cuenta enmascarada. |
| 10. Labor social | PASA | Certificado 2026-2 creado; 17 actividades en 6 dependencias; `HORAS_DIA_EXCEDIDAS` (tope 8 h) 422, `FECHA_FUTURA` 422, 0 horas 422, agregar a certificado COMPLETADO 409, semestre duplicado 409; completar 200 (55 h; el minimo configurado es 0); GE-F038 de 3 paginas (hoja principal con 15 actividades y 48,50 h, anexo con 2 actividades y 6,50 h, resumen por dependencia), total general 55,00 h; el sha256 del archivo coincide con `emision.sha256_archivo` y con `GET /publico/verificar/:codigo` (`valido:true`, tipo GE-F038). func2 y ben2 reciben 404. |
| 11. Reportes | PASA (parcial) | Consolidado XLSX y CSV como administrador y como func1: 200, estado LISTO, descarga firmada. El CSV tiene BOM UTF-8 (`EF BB BF`); el del administrador incluye 6 columnas sensibles (tipo y numero de documento, estrato, categoria y puntaje SISBEN, ultimos 4 digitos del medio de pago) y el de func1 no. func1 sobre una convocatoria ajena da 404; beneficiario 403. `GET /reportes/postulaciones/:id/resumen.pdf` genera PDF (tras D-02: admin y titular 200; func1, func2 y ben2 404). **Sin comprobar** saneo de formulas y numeros negativos: la convocatoria no tiene filas (0 expedientes enviados). |
| 12. Dashboards | PASA | Funcionario (7 rutas), administrador (resumen, alertas, convocatorias, carga-evaluadores; `metricas/periodo` exige `a` y `b` y responde 422 sin ellos, correcto) y beneficiario (resumen, descargas con los dos formatos generados, otorgamientos) responden 200, ninguno 500. Conteos coherentes (0 enviadas, 2 en comite, 13 beneficiarios activos). Se detecto D-03 (detector `TRABAJO_FALLIDO` con error SQL en `detectores_con_error`). Los conteos con expedientes enviados no pudieron verificarse. |
| 13. Auditoria y notificaciones | PASA | `GET /auditoria` lista creacion, actualizacion, descargas, generacion de formatos, labor social y exportaciones con hash encadenado; no contiene la contrasena, tokens JWT, URLs firmadas ni el numero de cuenta completo (el medio de pago aparece enmascarado y estrato, SISBEN y documento se registran como `[SENSIBLE]` o `***222`). `GET /auditoria/integridad` 200. Notificaciones del beneficiario (soporte rechazado) y panel de outbox 200. |
| 14. Autorizacion cruzada | PASA (tras D-02) | ben2 sobre postulacion, validacion, documentos, formatos, historial, generar formato, subir, eliminar y labor social de ben: 404 en todos. Beneficiario en evaluacion, bandeja, seguimiento, auditoria y dashboards de otros roles: 403. func1 en auditoria, dashboard admin, seguimiento admin y creacion de convocatoria: 403. func1 en convocatoria ajena (reporte): 404. Antes de D-02, un funcionario del comite podia descargar el resumen PDF (con estrato, SISBEN y documento) de un BORRADOR que no era suyo. |

## 4. Resultados del recorrido en navegador

Se inicio sesion con cada rol en contextos aislados y se abrieron las rutas con datos reales (Chromium, 1366x850). Salvo lo indicado, todas renderizan el titulo y los datos esperados y no producen errores de consola.

| Rol | Rutas | Resultado |
| --- | --- | --- |
| Administrador | `/admin`, `/admin/convocatorias`, `/admin/convocatorias/:id`, `/admin/seguimiento`, `/admin/seguimiento/cupos`, `/admin/reportes`, `/admin/asignaciones`, `/admin/postulaciones`, `/admin/postulaciones/:id`, `/admin/auditoria`, `/admin/configuracion`, `/admin/notificaciones/entregas`, `/admin/funcionarios`, `/admin/beneficiarios` | PASA. Solo dos advertencias: 404 de un recurso estatico (favicon) y la advertencia de React por claves repetidas en `/admin` (D-04, corregida). El panel muestra el aviso "Algunos detectores no pudieron ejecutarse: TRABAJO_FALLIDO" (D-03). |
| Funcionario | `/funcionario`, `/funcionario/bandeja`, `/funcionario/evaluacion/:id`, `/funcionario/reportes` | PASA. La evaluacion de un expediente no asignado muestra "Expediente no disponible" (404 esperado). La bandeja y el panel se muestran vacios (sin expedientes enviados). |
| Beneficiario | `/beneficiario`, `/perfil`, `/postulaciones`, `/postulaciones/:id`, `/documentos`, `/formatos`, `/historial`, `/labor-social`, `/beneficios`, `/notificaciones` | PASA. Documentos lista 10 soportes (con el aviso del reemplazo rechazado), formatos y labor social muestran los datos reales. `/beneficios` muestra el estado vacio correcto. |
| Paleta | todas | Colores calculados: negro, blanco y `rgb(35, 141, 193)` (#238dc1) con sus variantes de opacidad; sin otros matices. |

Capturas: `docs/qa/verif-admin-*.png`, `verif-func1-*.png`, `verif-ben-*.png` (29 archivos). No se pudieron tomar capturas de evaluacion con expediente, seguimiento con otorgamientos ni reportes con filas por el bloqueo D-01.

Observacion de rendimiento (baja): las lecturas del detalle de postulacion son lentas contra la base remota: `GET /postulaciones/:id` 1,7 s, `/documentos` 2,2 s y `/validacion` 4,5 s. La pantalla de documentos muestra "Cargando soportes..." durante unos segundos. Es consecuencia de consultas secuenciales; se recomienda consolidarlas, pero no se modifico.

## 5. Defectos

| Id | Severidad | Modulo | Ubicacion | Descripcion | Estado |
| --- | --- | --- | --- | --- | --- |
| D-01 | Critica | postulaciones (SQL) | `supabase/migrations/0006_postulaciones.sql`, lineas 249 y 292 (funcion `fn_enviar_postulacion`) | La funcion llama a `digest(..., 'sha256')` de pgcrypto. En Supabase pgcrypto vive en el esquema `extensions` y la funcion se declara con `set search_path = public`, por lo que falla con 42883. Resultado: `POST /postulaciones/:id/enviar` y `/subsanar` responden 500 y ninguna postulacion puede enviarse. | **Requiere 0021** (reemplaza `digest` por `sha256(bytea)`, como ya hace 0011) |
| D-02 | Alta (privacidad) | formatos_oficiales / export_reports | `apps/api/src/modules/formatos_oficiales/ports/expediente-acceso.port.ts`, `funcionarioTieneAlcance` (lineas 25 a 45) | El alcance de lectura de un funcionario se resolvia por pertenecer al comite de la convocatoria (marcado PROVISIONAL a la espera del modulo de asignaciones). Cualquier miembro del comite podia descargar el resumen PDF (incluye estrato, SISBEN y documento) y los formatos de cualquier postulacion de la convocatoria, incluso borradores y expedientes de otro evaluador, contradiciendo el pool de datos minimos. | **Corregido**: el alcance exige asignacion ACTIVA o haber abierto/emitido una revision propia (la asignacion se libera al dictaminar). Verificado: func1 y func2 reciben 404; administrador y titular 200. Cambia el comportamiento (no el contrato) de `GET /reportes/postulaciones/:id/resumen.pdf`, `GET /formatos/:id`, `/formatos/:id/descarga` y `GET /postulaciones/:id/formatos` para funcionarios. |
| D-03 | Media | admin_dashboard (SQL) | `supabase/migrations/0009_admin_dashboard.sql`, linea 421 (`fn_admin_alertas`) | El detector `TRABAJO_FALLIDO` de correos usa `evento_outbox.actualizado_en`, que no existe (la tabla tiene `creado_en`, `procesado_en`, `proximo_intento_en`). El detector falla en cada llamada y el panel muestra un aviso permanente; las alertas de correos fallidos nunca se generan. | **Requiere 0021** (usa `coalesce(procesado_en, creado_en)`) |
| D-04 | Baja | admin_dashboard (web) | `apps/web/src/modules/admin_dashboard/components/CargaEvaluadoresChart.tsx`, linea 43 | Con maximo igual a 1 los ticks eran `[0, 1, 1]`, claves repetidas en React (advertencia de consola en `/admin`). | **Corregido** (ticks sin duplicados) |
| D-05 | Baja | documentos | `GET /postulaciones/:id/validacion` y `/documentos` | Latencia de 2 a 4,5 s por consultas secuenciales (ver seccion 4). | Abierto (mejora) |
| D-06 | Informativa | entorno | `apps/api/.env` | Valores `SUPABASE_*` con espacio inicial; la API los tolera. | Abierto (limpieza) |

Defectos en archivos de otros agentes: ninguno detectado (no se modificaron `accounts`, `beneficiario_dashboard` ni `DescargasOficialesCard`; `GET /dashboard/beneficiario/descargas` respondio 200 con los dos formatos).

### 5.1. Migracion 0021

Archivo: `supabase/migrations/0021_correcciones_verificacion.sql`. Contenido: `create or replace function public.fn_enviar_postulacion(...)` (cuerpo identico al de 0006 salvo `sha256(...)` en lugar de `digest(...)`) y `create or replace function public.fn_admin_alertas()` (detector de correos corregido). Es idempotente; los permisos existentes se conservan con `create or replace`. **No se aplico** (esta sesion no tiene acceso SQL); debe ejecutarse en el Editor SQL de Supabase.

Pruebas que dependen de 0021 y deben repetirse tras aplicarla:

- Paso 6: enviar con Idempotency-Key y repeticion sin duplicados, estado PENDIENTE, historial, notificacion y evento_outbox del envio.
- Pasos 7 y 8: bandeja con resumen minimo, tomar, YA_ASIGNADA, evaluacion, dictamen CORRECCION, anonimato del evaluador, subsanar (tambien usa `fn_enviar_postulacion`), segundo evaluador, aprobar con decisiones y monto, VERSION_CONFLICTO, 422 con documento NO_PRESENTA, asignacion liberada.
- Paso 9: otorgamientos, desembolsos, pagos, tope del monto, suspension y reactivacion, mis-otorgamientos con cuenta enmascarada, carga masiva.
- Paso 11: saneo de formulas y numeros negativos en el CSV con filas reales; PDF de resumen para un expediente enviado.
- Paso 12: conteos de dashboards con expedientes en cada estado; ausencia del aviso `TRABAJO_FALLIDO` (D-03).
- Navegador: bandeja con datos, evaluacion con expediente, seguimiento con otorgamientos.

Tambien conviene agregar una prueba automatica que ejecute `fn_enviar_postulacion` contra la base (las pruebas actuales usan un mock del RPC, por eso D-01 no se detecto antes).

## 6. Datos de prueba creados y limpieza

Creados (todos de prueba, identificables por el prefijo `verif.` o el nombre "Verificacion"):

- Usuarios Auth y `public.usuario`: `verif.admin@foest.test`, `verif.func1@foest.test`, `verif.func2@foest.test`, `verif.ben@foest.test`, `verif.ben2@foest.test`; filas en `funcionario` (2) y `beneficiario` (2, documentos 9000000111 y 9000000222) y consentimientos.
- Convocatoria "Verificacion integral 2027-1" (id `54937298-b977-44ca-a126-9e1a11f5765a`, HABILITADA) con 2 beneficios ofertados y comite de 2 funcionarios.
- Postulacion BORRADOR `7a714815-5b5d-45ae-b5b9-e168e87a3921` con 10 documentos (versiones, incluidas 3 rechazadas), 2 formatos generados (GE-F041, GE-F043) y sus archivos en los buckets `documentos` y `formatos`.
- Certificado de labor social 2026-2 (17 actividades, COMPLETADO) y certificado 2026-1 (1 actividad, EN_PROCESO); PDF GE-F038 en `formatos/labor-social/`.
- 4 reportes de consolidado (2 XLSX, 2 CSV) en el bucket `reportes`; notificaciones, eventos de auditoria (append-only; no se borran) y filas de outbox.

Limpieza sugerida (Supabase, con service role o desde el panel):

1. Borrar la postulacion `7a714815-...` (cascada a documentos, formatos, historial; luego vaciar los objetos de Storage con prefijo `postulaciones/7a714815-.../` y `7a714815-.../` en `documentos` y `formatos`).
2. Borrar los dos certificados de labor social del beneficiario `verif.ben` y el prefijo `labor-social/<id>/` en `formatos`.
3. Borrar los registros de `reporte_generado` de la convocatoria y sus objetos en `reportes`.
4. Archivar o borrar la convocatoria `54937298-...` (borrar `asignacion_funcionario` y `convocatoria_beneficio` antes).
5. Borrar los 5 usuarios `verif.*` en Authentication -> Users (cascada a `usuario`, `funcionario`, `beneficiario`).
6. La auditoria es inmutable; los eventos de esta verificacion permanecen y son reconocibles por el actor.

Las contrasenas no se documentan; el archivo del scratchpad con la contrasena de prueba debe eliminarse al terminar. Los procesos arrancados (API 4150, web 5190, servidor auxiliar de sesion en el puerto 4152 y los observadores `tsx watch` que quedaron inactivos tras un reinicio de `@foest/shared`) fueron detenidos.

## 7. Lo que quedo sin verificar y por que

1. Envio, reenvio idempotente, estado PENDIENTE, historial/notificacion/outbox del envio: bloqueado por D-01.
2. Asignaciones con expedientes (resumen minimo, tomar, YA_ASIGNADA), evaluacion completa (chequeo, dictamenes, anonimato, subsanacion, VERSION_CONFLICTO, 422 NO_PRESENTA, liberacion): requieren un expediente PENDIENTE (D-01). Se descarto emular el envio escribiendo directamente en las tablas con service role: la operacion fue rechazada por el control de permisos de la sesion y, ademas, no habria probado el flujo real.
3. Seguimiento con otorgamientos (desembolsos, pagos, tope de monto, suspension/reactivacion, mis-otorgamientos con datos, carga masiva dry_run): requiere aprobacion.
4. Saneo de formulas y numeros negativos del CSV y contenido de filas del XLSX: sin filas en la convocatoria (se comprobaron BOM y columnas sensibles por rol; el saneo cuenta con pruebas unitarias propias).
5. Conteos de dashboards con expedientes en cada estado y las alertas de pool, subsanacion y sobrecarga; tambien el uso de `historial_estado_postulacion` en lugar de `postulacion_asignacion` que `0009_admin_dashboard.sql` declara para identificar al evaluador (comentario de las lineas 186 a 190), a revisar con datos reales.
6. Restablecimiento de clave (`accounts`): fuera de alcance (lo modifica otro agente).
7. Entrega real de correos: sin SMTP; solo se comprobaron las filas de outbox existentes.
8. Antivirus: sin `CLAMAV_HOST` los archivos pasan sin escaneo externo; solo se probo el validador interno (firma, JavaScript, cifrado).
9. Capturas de pantallas con expediente (evaluacion, seguimiento con datos): ver el punto 2.
