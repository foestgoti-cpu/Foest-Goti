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

---

# Segunda pasada (con 0021 y 0022 aplicadas)

Fecha: 7 de octubre de 2026 (noche). Misma metodologia: API propia en el puerto 4150 (`tsx`, sin watch, `RATE_LIMIT_MAX=5000`, `DATOS_PAGO_KEY` aleatoria solo del proceso), web propia en 5190, usuarios `verif.*`, escrituras solo a traves de la API (no se emulo nada con service role; la base solo se leyo para contar filas). No se creo `0023`: no se encontraron defectos de SQL nuevos.

## S1. Confirmacion de 0021 y 0022

- 0021 efectiva: `POST /postulaciones/:id/enviar` responde 200 (antes 500 "function digest"); las alertas de admin ya no traen `detectores_con_error` (el falso `TRABAJO_FALLIDO` desaparecio).
- 0022 efectiva: `POST /reportes/convocatorias/:id/consolidado` con `{formato:'HTML'}` responde 200 y guarda el tipo `CONSOLIDADO_HTML`; con `XLSX` responde 422 (`Expected 'HTML' | 'CSV'`); los XLSX historicos aparecen en la lista como "Consolidado XLSX (historico)".

## S2. Tabla de pasos (segunda pasada)

| Paso | Resultado | Evidencia |
| --- | --- | --- |
| 6. Envio | PASA | 200 `PENDIENTE` (ciclo 1, hash de envio); repeticion con la misma llave 200 `repetido:true` sin duplicar; con otra llave 409 `TRANSICION_INVALIDA`; historial `BORRADOR -> PENDIENTE (ENVIO)`; notificacion `POSTULACION_ENVIADA` en la campana; filas de `evento_outbox` `POSTULACION_ENVIADA` y `POSTULACION_EN_REVISION`. |
| 7. Asignaciones | PASA | Bandeja con codigo `FOEST-2027-1-7A7148`, tramite, beneficios, estado y dias de espera: sin nombre, documento, SISBEN ni estrato; func1 toma (200, `EN_EVALUACION`); func2 recibe 409 `YA_ASIGNADA` al tomar y 404 al abrir; su bandeja queda en 0. |
| 8. Evaluacion | PASA | Expediente con pago enmascarado (`•••• 1234`, sin el numero completo); chequeo por tipo (SISBEN NO_PRESENTA) 200; dictamen CORRECCION con fecha limite 2026-10-14 (dia habil, guardada como fin de dia en Bogota) -> `EN_CORRECCION`; el beneficiario ve `correccion_vigente` con `firma:"Equipo FOEST"`; busqueda del id, correo, nombre o cargo de los evaluadores en postulacion, historial, notificaciones, resumen del dashboard y documentos: sin fugas; el reemplazo de SISBEN crea la version 3; `subsanar` 200 -> `PENDIENTE` ciclo 2; la asignacion de func1 queda `LIBERADA/DICTAMEN_EMITIDO`; func2 la toma y ve la decision previa; con HOR_CLA `NO_PRESENTA` el dictamen APROBAR da 422 `DOCUMENTOS_OBLIGATORIOS_PENDIENTES`; APROBAR con SUP 1 500 000 y ST 300 000 -> `APROBADA` y asignaciones liberadas. Segunda postulacion (ben2): VERSION_CONFLICTO 409 al reenviar la version anterior (`version_actual:3`); APROBAR parcial (SUP 150 000 000 aprobado, ST rechazado con motivo) -> `APROBADA`, `aprobacion_parcial:true`. Nota: la primera prueba de "version vieja" fue invalida (el chequeo no incrementa la version) y se repitio en la segunda postulacion. |
| 9. Seguimiento | PASA | Un otorgamiento por beneficio aprobado (ST 300 000, SUP 1 500 000; en la segunda postulacion solo el SUP aprobado, 150 000 000). Desembolso en sabado, en festivo (12-oct) y en fecha pasada: 422 `FECHA_PROGRAMADA_INVALIDA`; 1 600 000 sobre 1 500 000 y 500 000 + 1 100 000: 422 `MONTO_EXCEDE_APROBADO`; programar 500 000 (14-oct) 201; pagar con `REF-VERIF-001` 200; suspender 200, desembolso en suspendido 409, reactivar 200; el funcionario recibe 403 `SIN_PERMISO` en todo `/seguimiento` de administracion (`ROL_NO_AUTORIZADO` solo se devuelve a beneficiarios en rutas de administrador). Otorgamiento con `excede_presupuesto:true`: primer desembolso sin confirmar 409 `EXCEDE_PRESUPUESTO`, con `confirmar_excedente:true` 201; `cumplir` con desembolsos pendientes 409 `DESEMBOLSOS_PENDIENTES` y con `forzar:true` 200. `/cupos`: ST 1 cupo y 300 000 pagados, SUP 1 cupo. `/mis-otorgamientos`: cuenta `•••• 1234`, nunca el numero completo. Carga masiva: dry_run valido, dry_run con filas erroneas (monto sobre saldo, id invalido) sin aplicar, real sin `confirmar` 422 `CONFIRMACION_REQUERIDA`, real con `confirmar` 200 (desembolso pagado `REF-MASIVA-01`). |
| 10. Labor social (integracion) | PASA | `GET /dashboard/beneficiario/descargas` lista el certificado en `certificados_labor_social` (semestre, horas, ultima emision definitiva y URL). Las descargas repetidas NO crean emisiones nuevas: 3 descargas seguidas dejan 1 fila en `labor_social_emision`; solo al reabrir, agregar una actividad y completar de nuevo se crea la segunda fila (2 en total) y el panel pasa a 57 horas. La sospecha de emision por descarga no se confirmo. |
| 11. Reportes con filas | PASA | HTML y CSV como admin, func1 y func2: 200, `LISTO`, 2 filas. HTML: se entrega como adjunto (`Content-Disposition: attachment`), `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff` y una meta CSP; 0 apariciones de `<script`; los valores `<b>x</b>`, `&` y `<script>alert(1)</script>` del formulario salen como `&lt;b&gt;x&lt;/b&gt;`, `&amp;` y `&lt;script&gt;`; el HTML de func trae 18 columnas y el de admin 24 (agrega documento, estrato, SISBEN y medio de pago). CSV: BOM, `'=HYPERLINK(...)` con comilla de saneo; montos sin comilla; el CSV de func1 y func2 sin columnas sensibles. Reporte ajeno: func1 404 (descarga y job), beneficiario 403, convocatoria ajena 404. `resumen.pdf`: admin, titular y evaluadores con revision propia 200; func1 sobre la postulacion 2 (sin revision) 404; ben2 sobre la postulacion 1 404. La solicitud desde `/admin/reportes` (HTML, confirmacion escribiendo EXPORTAR) funciona y lista el reporte. Observacion: el `Content-Type` del HTML descargado es `text/plain` (lo fija Storage) y no `text/html`; con adjunto, CSP y `nosniff` es la opcion mas segura. Sin comprobar el saneo de numeros negativos (no hay valores negativos en los datos; cubierto por pruebas unitarias). |
| 12. Dashboards con datos | PASA | Tras `fn_refrescar_metricas`: funcionario `asignadas:2, aprobadas:2` (agregado del comite), `propia.dictaminadas_periodo` 1 (func1) y 2 (func2), cifras con supresion k-anonima (`umbral:5`); admin `monto_aprobado_total 151 800 000`, `monto_desembolsado 800 000`, 2 postulaciones APROBADA, alerta `CUPOS_SUPERADOS` coherente (SUP al 152 % del presupuesto) y `detectores_con_error: []`; carga por evaluador 2 y 1 dictamenes; beneficiario: otorgamientos con `ultimos4:"1234"` y desembolsos. Ninguno responde 500. |
| 13. Auditoria y notificaciones | PASA | Eventos nuevos del recorrido (ENVIAR, SUBSANAR, TOMAR, DICTAMINAR, CREAR/CUMPLIR/SUSPENDER/REACTIVAR OTORGAMIENTO, DESEMBOLSAR, CARGA_PAGOS, REABRIR, EXPORTACION, RESTABLECER_CLAVE, LECTURA_SENSIBLE). Sin contrasena, JWT, URL firmada, cuenta completa ni numero de billetera. `/auditoria/integridad` 200 sin ruptura (`valida:true`), pero la ultima verificacion registrada es del 6-oct con 55 eventos y hay 217 pendientes de verificar (secuencia 489). `restablecer-clave` (probado con `verif.func2`): 200 con `clave_temporal` solo en la respuesta, func1 recibe 403, el login con la clave temporal responde `forzar_cambio_clave:true`, la clave NO aparece en la auditoria (evento `RESTABLECER_CLAVE` con motivo), notificacion, outbox ni en el log de la API (400 KB revisados). Despues se restablecio la contrasena de prueba. |
| 14. Autorizacion cruzada (recursos nuevos) | PASA | ben2 sobre otorgamiento ajeno: 404 (`mis-otorgamientos`) y 403 (`otorgamientos`); funcionario en `/seguimiento/*` (consulta, cupos, desembolsos, carga masiva): 403; beneficiario en `/seguimiento/cupos`: 403 `ROL_NO_AUTORIZADO`; ben2 pagando un desembolso: 403; evaluacion: ben y ben2 403, funcionario sin revision ni asignacion 404; historial de asignacion ajeno 404; GE-F038 ajeno 404; reporte de otro usuario 404 (funcionario) y 403 (beneficiario). |

## S3. Recorrido de navegador (segunda pasada)

Chromium con contextos aislados por rol; capturas `docs/qa/verif2-*.png`. PASAN: `/admin` (alertas sin aviso de detectores), `/admin/seguimiento`, `/admin/seguimiento/:id` (otorgamiento con acciones), `/admin/seguimiento/cupos`, `/admin/seguimiento/carga-pagos`, `/admin/reportes` (solicitud HTML con doble confirmacion y descarga listada), `/admin/asignaciones`, `/admin/postulaciones/:id` (aprobada), `/admin/auditoria`, `/admin/convocatorias/:id`; `/funcionario`, `/funcionario/bandeja` (vacia: no queda nada pendiente), `/funcionario/evaluacion/:id` (modo solo lectura de una postulacion ya dictaminada, con formulario completo; los textos `<b>`, `<script>` y `=HYPERLINK` se muestran como texto, sin ejecutarse), `/funcionario/reportes`; `/beneficiario`, `/beneficiario/postulaciones/:id` (aprobada), historial, `/beneficiario/beneficios` (otorgamientos y pagos), `/beneficiario/labor-social`, `/beneficiario/notificaciones` (16 sin leer). Paleta: solo negro, blanco y #238dc1 (mas opacidades). No hay capturas de la evaluacion con dictamen activo ni de la bandeja con expedientes porque ya no quedan expedientes pendientes (todos se dictaminaron durante la prueba de API).

## S4. Defectos nuevos y estado de los previos

| Id | Severidad | Modulo | Ubicacion | Descripcion | Estado |
| --- | --- | --- | --- | --- | --- |
| D-07 | Media | auth | `apps/api/src/modules/auth/*` (middleware `authenticate`) | `forzar_cambio_clave` solo se aplica en el cliente: con la clave temporal el token obtenido sirve para llamar a cualquier endpoint (p. ej. `GET /dashboard/funcionario/resumen` responde 200). | Abierto (requiere decision: bloquear en `authenticate` todo salvo cambio de clave, `/auth/me` y cierre de sesion) |
| D-08 | Baja | beneficiario_dashboard (web) | `apps/web/src/modules/beneficiario_dashboard/components/AccionesPendientesAlert.tsx`, linea 22 | Claves repetidas (`OTORGAMIENTO_INFO-<postulacion>`) cuando una postulacion aprobada tiene varios otorgamientos (advertencia de React en `/beneficiario`). | Corregido (la clave incluye el indice) |
| D-09 | Baja | export_reports (web) | pantalla `/admin/reportes` | El texto "El HTML se abre en el navegador" no coincide con la descarga forzada como adjunto con `Content-Type: text/plain`. | Abierto (texto) |
| D-10 | Baja | auditoria | tareas programadas | 217 eventos sin verificar desde el sellado inicial del 6-oct; no hay endpoint manual de verificacion. | Abierto (confirmar que el job corre) |
| D-11 | Baja | evaluacion (web) | `/funcionario/evaluacion/:id` | En solo lectura el bloque "Plazo maximo de subsanacion" se muestra aunque la postulacion este APROBADA; la carga del expediente tarda 3 a 6 s por consultas remotas secuenciales. | Abierto |

Estado de los previos: D-01 CORREGIDO (verificado con 0021); D-02 CORREGIDO y vigente (funcionario sin revision propia ni asignacion: 404; evaluadores con revision propia conservan la lectura); D-03 CORREGIDO (verificado: `detectores_con_error: []`); D-04 CORREGIDO (sin advertencia en `/admin`); D-05 ABIERTO (la latencia persiste); D-06 ABIERTO (informativa).

## S5. Datos de prueba nuevos (ademas de los de la seccion 6)

- Postulacion de `verif.ben2` `439c5a60-6f0a-4fa2-bd49-bffaf995d360` (APROBADA parcial; campos con `<b>x</b>`, `<script>`, `=HYPERLINK(...)`, `-`, `+`, `@`), con 10 documentos, GE-F041 y GE-F043, y su otorgamiento SUP (150 000 000, CUMPLIDO) con 2 desembolsos anulados.
- Postulacion `7a714815-...` de `verif.ben` ahora APROBADA (ciclo 2) con otorgamientos SUP (`157e30a0-...`, 1 500 000, desembolso pagado 500 000) y ST (`917c5f0f-...`, 300 000 pagados por carga masiva) y una carga masiva registrada.
- Reportes nuevos (HTML y CSV) de admin, func1 y func2 y los solicitados por la interfaz; una emision adicional de GE-F038 (2 en total) y una actividad nueva del certificado 2026-2 (57 h).
- Revisiones, asignaciones (todas `LIBERADA`), notificaciones, filas de outbox (incluida `CAMBIO_CLAVE_CONFIRMACION` de `verif.func2`, pendiente) y eventos de auditoria (inmutables).
- A `verif.func2` se le restablecio la clave durante la prueba y luego se fijo de nuevo la contrasena de prueba.

Limpieza adicional: borrar `otorgamiento` y `desembolso` de ambas postulaciones antes de las postulaciones; despues seguir los pasos de la seccion 6 (incluidas las dos postulaciones y todos los usuarios `verif.*`, el comite y la convocatoria `54937298-...`).

## S6. Sin verificar en la segunda pasada

1. Bandeja con expedientes y evaluacion activa (dictamen en pantalla) en navegador: no quedaron expedientes pendientes; para capturarlos hace falta una tercera postulacion.
2. `revocar` otorgamientos y `anular` desembolsos: no se ejercieron.
3. Saneo de numeros negativos en CSV con datos reales (no hay valores negativos); entrega real de correos (sin SMTP).
4. Alertas operativas de pool, subsanacion y sobrecarga con datos reales (solo se observo `CUPOS_SUPERADOS`).
5. Verificacion de la cadena de auditoria posterior al sellado inicial (D-10).
