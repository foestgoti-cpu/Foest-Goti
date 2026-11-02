# Informe de dependencias: 2026-11-01

- Scanner: `npm audit` (salida en `scanner-npm-audit.json`, ejecutado antes de esta tarea).
- Alertas del scanner: 27 paquetes (5 high, 18 moderate, 4 low, 0 critical).
- Hallazgos en el informe: 6 (3 P1, 2 P2, 0 P3, 1 P4). Todos los paquetes del scanner quedan cubiertos.
- Intentos de inyección en el texto del scanner: ninguno detectado.
- Estado del verificador: ver la sección "Verificación".
- Pendiente: revisión de `revisor-dependencias`. Este informe no es final.

## P1 (requieren confirmación humana, mismo día)

Ninguna acción se ejecuta hasta que el responsable técnico confirme.

| Paquete | Versión | ID | Base → final | Motivo de la subida | Propuesta |
|---|---|---|---|---|---|
| body-parser (vía express) | 1.20.8 | GHSA-27r3-jxmh-p828 | P2 → P1 | Procesa el cuerpo de todas las rutas de apps/api, incluidas las de datos de beneficiarios | Refrescar lockfile a 1.20.9 (cabe en `~1.20.5` de express) |
| zod | 3.25.76 | GHSA-mrhx-c7xc-m3w5 | P2 → P1 | Los esquemas de packages/shared validan datos de beneficiarios en apps/api | Migrar a 4.6.7 (salto mayor 3 → 4) |
| puppeteer (vía chromium-bidi → zod) | 25.12.0 | GHSA-mrhx-c7xc-m3w5 | P2 → P1 | Genera los PDF de formatos oficiales con datos personales | Actualizar a 25.16.0 (trae chromium-bidi con zod ^4.6.5) |

## P2 (7 días)

| Paquete | Versión | IDs | Base → final | Motivo | Acción |
|---|---|---|---|---|---|
| nodemailer | 10.0.16 | GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h | P3 → P2 | Envía correos con datos de beneficiarios; los avisos permiten desviar un correo a otro destinatario | Actualizar a 10.1.4 |
| qs (vía express, body-parser) | 6.16.0 | GHSA-6pq8-jhm2-2vcw | P3 → P2 | Interpreta query strings de rutas con datos de beneficiarios; el fallo está en `stringify` | Refrescar lockfile a 6.16.1 |

## P4 (mantenimiento regular)

| Paquete raíz | Versión | IDs | Cubre | Acción |
|---|---|---|---|---|
| jest (solo desarrollo, ámbito C) | 30.5.2 | GHSA-3g3m-2fjr-6pw4 (glob), GHSA-g3hv-75wg-m249 (minimatch), GHSA-gcqx-w48m-w2h4 (deepmerge) | 19 transitivas de jest, más ts-jest | Vigilar (Regla 3). El scanner solo propone bajar a jest 25.1.0; no se recomienda. deepmerge no tiene versión corregida. |

## Dependencias fuera del mapa

Se trataron como ámbito A (o heredan el de su raíz). Una persona debe agregarlas a
`mapa-dependencias.json` y `mapa-dependencias.md`:

- `nodemailer` (directa, apps/api): correo. Propuesta: A, datos sensibles Sí.
- `ts-jest` (directa de desarrollo, apps/api y packages/shared). Propuesta: C.
- Transitivas a vigilar: `body-parser` y `qs` (raíz express, A), `chromium-bidi` y `puppeteer-core` (raíz puppeteer, A).
- Revisar la fila de Zod: el mapa dice "Datos sensibles: No", pero sus esquemas validan datos de beneficiarios.

## Versiones recomendadas

Comprobadas con `npm view` el 2026-11-01: body-parser 1.20.9, zod 4.6.7, puppeteer 25.16.0
(chromium-bidi 157.0.8090-0 pide zod ^4.6.5), nodemailer 10.1.4, qs 6.16.1.

## Borradores de aviso (no publicados)

Se crean con `gh issue create` solo tras el veredicto APROBADO del revisor.

### [P1] body-parser@1.20.8: GHSA-27r3-jxmh-p828

**Qué pasa:** body-parser, que lee el cuerpo de las peticiones de la API, puede caerse si recibe un cuerpo comprimido con bytes extra al final (denegación de servicio).

**Dónde afecta a FOEST:** apps/api, ámbito A, transitiva de express. Sube a P1 porque procesa el cuerpo de todas las rutas, incluidas las de datos de beneficiarios.

**Qué hacer:**
1. Tras confirmar: refrescar el lockfile para que body-parser quede en 1.20.9 sin cambiar express.
2. Responsable técnico confirma hoy; el equipo ejecuta.

**Evidencia:** https://github.com/advisories/GHSA-27r3-jxmh-p828. Versión recomendada comprobada con npm view: sí. Informe: docs/seguridad/informes/2026-11-01/

**Confirmación:** [ ] Una persona confirma la prioridad (obligatorio en P1). [ ] Una persona aprueba la acción.

Etiquetas: `seguridad-dependencias`, `P1`, `requiere-confirmacion`.

### [P1] zod@3.25.76: GHSA-mrhx-c7xc-m3w5

**Qué pasa:** zod puede agotar la memoria al validar colecciones muy grandes con restricciones.

**Dónde afecta a FOEST:** packages/shared (lo importa apps/api), ámbito A. Sube a P1 porque sus esquemas validan datos de beneficiarios. El límite de 1mb de `express.json` reduce, sin eliminar, la exposición.

**Qué hacer:**
1. Tras confirmar: planificar la migración a zod 4.6.7 (salto mayor) en apps/api, apps/web y packages/shared.
2. Mientras tanto: revisar que los esquemas limiten el tamaño de arreglos y registros.
3. Responsable técnico confirma hoy; el equipo ejecuta.

**Evidencia:** https://github.com/advisories/GHSA-mrhx-c7xc-m3w5. Versión recomendada comprobada con npm view: sí. Informe: docs/seguridad/informes/2026-11-01/

**Confirmación:** [ ] Una persona confirma la prioridad (obligatorio en P1). [ ] Una persona aprueba la acción.

Etiquetas: `seguridad-dependencias`, `P1`, `requiere-confirmacion`.

### [P1] puppeteer@25.12.0: GHSA-mrhx-c7xc-m3w5

**Qué pasa:** puppeteer trae chromium-bidi, que usa una versión vulnerable de zod (mismo aviso que arriba).

**Dónde afecta a FOEST:** apps/api, ámbito A, módulo `formatos_oficiales`. Sube a P1 porque genera PDF con datos personales. El zod afectado valida mensajes del navegador local, no datos del usuario, así que la exposición práctica es baja.

**Qué hacer:**
1. Tras confirmar: actualizar puppeteer a 25.16.0 (misma versión mayor).
2. Confirmar que su script de instalación sigue en la lista permitida de la bitácora.
3. Responsable técnico confirma hoy; el equipo ejecuta.

**Evidencia:** https://github.com/advisories/GHSA-mrhx-c7xc-m3w5. Versión recomendada comprobada con npm view: sí. Informe: docs/seguridad/informes/2026-11-01/

**Confirmación:** [ ] Una persona confirma la prioridad (obligatorio en P1). [ ] Una persona aprueba la acción.

Etiquetas: `seguridad-dependencias`, `P1`, `requiere-confirmacion`.

### [P2] nodemailer@10.0.16: GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h

**Qué pasa:** el analizador de direcciones de nodemailer interpreta mal ciertos comentarios y comillas, y puede enviar un correo a un destinatario distinto del previsto.

**Dónde afecta a FOEST:** apps/api, módulo `notificaciones`. No está en el mapa (se trató como A). Sube a P2 porque los correos llevan datos de beneficiarios.

**Qué hacer:**
1. Actualizar nodemailer a 10.1.4.
2. Desarrollador asignado, plazo 7 días. Agregar nodemailer al mapa.

**Evidencia:** https://github.com/advisories/GHSA-8c8m-p3m8-cjg8, https://github.com/advisories/GHSA-m943-m63m-w62w, https://github.com/advisories/GHSA-85x2-q946-cp5h. Versión recomendada comprobada con npm view: sí. Informe: docs/seguridad/informes/2026-11-01/

Etiquetas: `seguridad-dependencias`, `P2`.

### [P2] qs@6.16.0: GHSA-6pq8-jhm2-2vcw

**Qué pasa:** `qs.stringify` con `arrayFormat: 'comma'` puede lanzar un error no controlado ante cierto tipo de arreglo (denegación de servicio).

**Dónde afecta a FOEST:** apps/api, transitiva de express y body-parser. Sube a P2 porque qs interpreta las peticiones con datos de beneficiarios; la API usa sobre todo `parse`, no `stringify`.

**Qué hacer:**
1. Refrescar el lockfile para que qs quede en 6.16.1 sin cambiar express.
2. Desarrollador asignado, plazo 7 días.

**Evidencia:** https://github.com/advisories/GHSA-6pq8-jhm2-2vcw. Versión recomendada comprobada con npm view: sí. Informe: docs/seguridad/informes/2026-11-01/

Etiquetas: `seguridad-dependencias`, `P2`.

### Aviso semanal P4

- jest@30.5.2 (desarrollo): GHSA-3g3m-2fjr-6pw4 (glob), GHSA-g3hv-75wg-m249 (minimatch), GHSA-gcqx-w48m-w2h4 (deepmerge). Sin arreglo razonable; vigilar nuevas versiones de jest.

_Generado por el agente triage-dependencias. Un revisor lo validó: pendiente._

## Verificación

- Corrida oficial (`node scripts/deps/verificar-informe.mjs docs/seguridad/informes/2026-11-01 --escribir`):
  **RECHAZADO, código 2**, `[GRAVE] JSON_INVALIDO`. Causa: `scanner-npm-audit.json` está en
  UTF-16LE con BOM (redirección de PowerShell) y el verificador lo lee como UTF-8. El agente
  no tuvo permiso para reescribir el archivo crudo; debe convertirlo una persona (mismo
  contenido, codificación UTF-8) y volver a ejecutar el verificador.
- Diagnóstico (no oficial): la función `verificar()` del script, con el scanner decodificado
  en memoria, devuelve APROBADO (6 hallazgos, 6 bases correctas, 5 subidas, 0 P1 degradados,
  0 IDs inventados, 0 alertas omitidas).
