# Guía para probar la plataforma FOEST (recorrido manual por rol)

Esta guía sirve para comprobar, con la base de datos real, que los módulos funcionan de punta a punta (navegador, API y Supabase). No reemplaza las pruebas automáticas ni la barrida de seguridad y QA que se hará al final.

## 1. Preparación (una sola vez)

1. **Dependencias:** `npm install` en la raíz.
2. **Variables de entorno:** `apps/api/.env` y `apps/web/.env` deben existir (ver `README-DEV.md` sección 2). Opcional en `apps/api/.env`: `DATOS_PAGO_KEY` (64 caracteres hexadecimales; sin ella no se pueden guardar datos de pago del subsidio de transporte). Generar una con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. **Migraciones:** en Supabase → SQL Editor, pegar y ejecutar cada archivo de `supabase/migrations/` **en orden numérico**: 0001, 0002, 0003, 0004, 0005, 0006, 0008, 0009, 0010, 0011, 0012, 0013, 0014, 0015, 0016, 0017, 0018, 0019, 0020 (no existe 0007). Todas son idempotentes: repetirlas no daña. Después, confirmar:

```bash
npm run verify:supabase
```

4. **Redirecciones de correo** (Supabase → Authentication → URL Configuration): agregar `http://localhost:5173/verificar-correo`, `http://localhost:5173/restablecer` y `http://localhost:5173/invitacion`.
5. **Usuarios de prueba** (uno por rol, con una contraseña que usted elige; el script no la imprime). Desde `apps/api`:

```bash
cd apps/api
QA_PASSWORD='UnaClave#2026' npx tsx --env-file-if-exists=.env scripts/crear-usuarios-prueba.ts
```

Crea `prueba.admin@foest.test`, `prueba.funcionario1@foest.test`, `prueba.funcionario2@foest.test` y `prueba.beneficiario@foest.test`. Es idempotente: si se repite, restablece la contraseña a la indicada. Opcional: agregar `QA_CONVOCATORIA_ID=<uuid>` para meter a los dos funcionarios al comité de una convocatoria que ya exista.

6. **Arrancar:**

```bash
npm run dev
```

API en `http://localhost:4000/api/v1` (probar `/health`) y web en `http://localhost:5173`. Si esos puertos están ocupados por una instancia anterior, deténgala antes (el web usa `strictPort`). Los correos no se envían de verdad si no hay SMTP: aparecen impresos en la terminal de la API.

## 2. Recorrido completo (flujo principal)

Use ventanas de incógnito distintas (o cierre sesión) para cambiar de rol. Contraseña: la de `QA_PASSWORD`.

### 2.1 Administrador (`prueba.admin@foest.test`)

1. Ingrese en `/login`. Debe llevarlo a `/admin` (panel con KPIs y alertas).
2. **Convocatoria:** `/admin/convocatorias/nueva`. Cree una de un período que no exista (la combinación año+semestre es única), con fechas que incluyan hoy, al menos un beneficio con cupos y presupuesto. En su detalle, pestaña **Comité**, agregue a los dos funcionarios. Luego **Habilitar** (pide confirmación). Si falta comité o beneficios, debe rechazarlo con un mensaje claro.
3. Verifique el listado público `/convocatorias` (sin iniciar sesión; se llega también con el banner «¿Aún no sabe a qué convocatoria puede postular?» de la pantalla de inicio de sesión `/`): debe aparecer la convocatoria con los días restantes.

### 2.2 Beneficiario (`prueba.beneficiario@foest.test`)

1. En `/beneficiario/perfil` complete el perfil (mayor de edad; documento único, estrato, SISBEN, dos correos, dirección y consentimiento). El indicador debe pasar a "perfil completo". Con fecha de nacimiento de menor debe pedir los datos del acudiente.
2. `/beneficiario/postulaciones/nueva` → elija la convocatoria y el tipo **PRIMERA_VEZ** (Renovación o Reintegro deben rechazarse si no hay una postulación aprobada previa).
3. En el asistente complete las secciones; el autoguardado muestra "Guardado hh:mm". Para un beneficio de transporte (`ST`) se piden los datos de pago (requiere `DATOS_PAGO_KEY`).
4. **Documentos** (paso "Documentos de soporte" o `/beneficiario/postulaciones/:id/documentos`): suba un PDF por cada soporte obligatorio. Un `.exe` renombrado a `.pdf` o un PDF con contraseña debe rechazarse. El estado pasa por Subiendo → Escaneando → Disponible (sin antivirus configurado queda "escaneo omitido").
5. **Formatos** (`/beneficiario/postulaciones/:id/formatos`): genere GE-F041 y GE-F043; descargue y revise los PDF (el pagaré lleva monto y fecha en blanco). Para los soportes `FORM_INS` y `PAG_CART` suba cualquier PDF como "firmado".
6. **Enviar:** el checklist de validación debe quedar completo; confirme en el modal. La postulación pasa a "En revisión por el Comité FOEST" y aparece una notificación en la campana.
7. Si cambia datos del formulario después de generar los formatos y vuelve a enviar, debe bloquear con "formatos desactualizados" hasta regenerarlos.

### 2.3 Funcionario 1 y 2

1. Con `prueba.funcionario1@foest.test`: `/funcionario/bandeja`. Debe ver el expediente en el *pool* con datos mínimos (código `FOEST-año-semestre-xxxxxx`, trámite, beneficios, días en espera). **No** deben aparecer nombre, documento ni SISBEN.
2. **Tomar** el expediente (doble confirmación). Pasa a EN_EVALUACION y se abre `/funcionario/evaluacion/:id`.
3. Revise el formulario y los documentos (el visor abre una URL de 5 minutos). Marque el chequeo por tipo (Presenta / No presenta / No aplica) y guárdelo.
4. **Primer dictamen: Solicitar corrección** (observaciones de al menos 15 caracteres, fecha límite). El beneficiario debe ver "Documentos pendientes de corrección" y la observación firmada como "Equipo FOEST", **sin** nombre del funcionario.
5. Con `prueba.funcionario2@foest.test`, abra la misma URL de evaluación: debe responder **no encontrado** (404), porque el expediente no es suyo.
6. El beneficiario corrige y reenvía (`Subsanar`); la postulación vuelve al *pool*. El funcionario 2 puede tomarla ahora.
7. **Segundo dictamen: Aprobar** con decisión por beneficio y monto. Puede aprobar uno y rechazar otro para ver la aprobación parcial. Si hay un documento obligatorio en "No presenta", debe rechazarlo. El beneficiario recibe la notificación.
8. Pruebe el bloqueo concurrente: abra el expediente en dos pestañas y dictamine en ambas; la segunda debe mostrar conflicto de versión.

### 2.5 Después de la aprobación (seguimiento de beneficios, labor social, reportes)

Con la postulación aprobada en 2.3:

1. **Seguimiento** (administrador): `/admin/seguimiento` debe mostrar un otorgamiento por cada beneficio aprobado, en estado ACTIVO y con el monto del dictamen. Abra el detalle y programe un desembolso (la fecha debe ser un día hábil y no pasada). Si el monto supera cupo o presupuesto de la convocatoria, debe pedir confirmación explícita. Registre el pago con una referencia y compruebe que la cuenta de pago aparece siempre enmascarada. Pruebe suspender, reactivar, cumplir y revocar (cada acción pide motivo de al menos 15 caracteres y doble confirmación; la revocación no diligencia el pagaré). `/admin/seguimiento/cupos` muestra la ocupación de cupos y presupuesto; `/admin/seguimiento/carga-pagos` permite probar la carga masiva con un CSV (primero la vista previa, luego aplicar). El beneficiario ve lo suyo en `/beneficiario/beneficios`, sin datos de cuenta.
2. **Labor social** (beneficiario): `/beneficiario/labor-social`. Cree un certificado, registre actividades (el tope diario se toma de la configuración), complételo cuando alcance las horas mínimas y descargue el GE-F038 (borrador o definitivo). Verifique que 16 actividades generan dos hojas y que la suma de horas coincide. El evaluador ve el resumen de horas en el expediente.
3. **Verificación pública:** abra `/verificar` y pegue el código impreso en cualquiera de los PDF (GE-F041, GE-F043 o GE-F038); solo debe mostrar si es válido, el tipo, la fecha y el SHA-256, sin datos personales.
4. **Reportes:** `/admin/reportes` (y `/funcionario/reportes`, limitado al comité). Solicite un consolidado HTML y otro CSV (la descarga del HTML llega como archivo adjunto; ábralo en el navegador, y puede imprimirlo o guardarlo como PDF desde allí). Para comprobar el escape, use una convocatoria con un dato que contenga `<b>` o `<script>` (por ejemplo en un nombre): en el HTML debe verse como texto literal, sin negrita ni ejecución de scripts. con pocos expedientes responde de inmediato; el funcionario recibe el archivo sin estrato, SISBEN ni documento (solo el administrador los incluye). Abra el CSV y compruebe que las celdas de texto que empiezan con `=`, `+`, `-` o `@` van con comilla simple y que los números negativos no se alteran. El botón de resumen en PDF aparece en el detalle de la postulación (administrador) y en la pantalla de evaluación.

### 2.4 De nuevo el administrador

- `/admin/asignaciones`: carga por evaluador, alertas y reasignación (individual y masiva).
- `/admin/postulaciones`: listado global y detalle de lectura.
- `/admin/auditoria`: cada paso anterior debe aparecer con actor, antes/después y sin contraseñas ni datos de pago. La lectura del expediente figura como lectura sensible.
- `/admin/configuracion`: cambie un valor (por ejemplo `SUBSANACION_DIAS_HABILES`) y vea que el siguiente dictamen de corrección lo usa; abra la misma clave en dos pestañas para provocar el conflicto de versión.
- `/admin/notificaciones/entregas`: los correos encolados y su estado (con `ConsoleMailer` quedan como enviados y se imprimen en la terminal de la API).
- `/funcionario` (métricas) y `/admin` (resumen y alertas) deben mostrar datos reales de lo que acaba de hacer; las cifras se actualizan cada 5 minutos.

## 3. Comprobaciones rápidas por API

Sin token todo debe responder 401 y `GET /api/v1/health` debe dar 200 con `supabase: "ok"`. Un beneficiario pidiendo `/api/v1/evaluacion/postulaciones/<id>` debe recibir 403; un funcionario que no sea el titular, 404.

## 4. Qué reportar si algo falla

Pegue: la ruta o pantalla, el mensaje en pantalla, la pestaña *Network* (petición y respuesta, sin tokens) y las últimas líneas de la terminal de la API. Un 503 `MIGRACION_PENDIENTE` significa que falta aplicar la migración del módulo.

## 5. Limitaciones conocidas

- Antivirus: sin `CLAMAV_HOST` los archivos se aceptan marcados como "escaneo omitido".
- Correo: sin SMTP no hay envío real; las invitaciones de funcionarios, la verificación de correo y el restablecimiento de contraseña los envía Supabase Auth, que tiene un límite de envíos por hora; con dominios `.test` esos correos no llegan. Por eso se usa el script de usuarios de prueba.
- El texto jurídico del pagaré y de las declaraciones juramentadas es provisional.
- El texto jurídico de los formatos GE-F038, GE-F041 y GE-F043 es genérico y requiere validación jurídica.

## 6. Limpieza

Los usuarios `prueba.*@foest.test` y los datos de prueba pueden borrarse desde el panel de Supabase (Authentication → Users y las tablas `postulacion`, `convocatoria`). Los usuarios `qa+*@foest.test` y la convocatoria "2099-2" los crearon pruebas automáticas anteriores y también pueden eliminarse.
