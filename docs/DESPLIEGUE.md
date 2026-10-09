# Despliegue de FOEST: web en Vercel, API en Render, datos en Supabase

Archivos que lo hacen posible (en la raíz del repositorio): `vercel.json`, `render.yaml`, `Dockerfile` y `.dockerignore`.

Orden: 1) Supabase listo, 2) API en Render, 3) web en Vercel, 4) volver a Render y a Supabase para fijar las URLs reales.

## 0. Antes de empezar

1. Que el código esté en GitHub (rama `main`) y actualizado: `git push`.
2. Que las migraciones `supabase/migrations/0001` a `0022` estén aplicadas en el proyecto de Supabase de producción (en orden; no existe la 0007). Se comprueba con `npm run verify:supabase`.
3. Tener a mano, desde Supabase → Project Settings → API: `Project URL`, `anon key` y `service_role key`.
4. Generar la clave de cifrado de los datos de pago (guárdela en un gestor de contraseñas; si se pierde, los datos cifrados no se pueden leer):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 1. API en Render

1. Render → **New** → **Blueprint** → conecte el repositorio de GitHub. Render lee `render.yaml` y crea el servicio `foest-api` (Docker, plan Starter).
2. Render le pide los valores marcados como secretos. Complete:

| Variable | Valor |
|---|---|
| `WEB_ORIGIN` | Por ahora ponga `https://foest.vercel.app` (provisional); se corrige en el paso 3.4 |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (solo aquí, nunca en Vercel) |
| `DATOS_PAGO_KEY` | La clave de 64 caracteres generada arriba |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Los de su proveedor de correo. Si los deja vacíos, los correos solo se escriben en el log y no llegan a nadie |
| `MAIL_WEBHOOK_SECRET` | Opcional; mínimo 16 caracteres |

3. Espere el primer despliegue (varios minutos: instala Chromium para los PDF). Cuando diga **Live**, abra `https://<su-servicio>.onrender.com/api/v1/health`. Debe responder `"ok": true` y `"supabase": "ok"`. Si dice `sin_credenciales`, falta alguna de las tres variables de Supabase.
4. Anote la URL del servicio (la usa Vercel).

Notas:
- **No use el plan Free:** se duerme a los 15 minutos y los trabajos programados (outbox de correos, recordatorios, vistas materializadas, auditoría) dejan de correr. Además Chromium necesita más de 512 MB; Starter (512 MB) alcanza para uso moderado, y si ve reinicios al generar PDF suba a Standard.
- `PORT` lo inyecta Render; no la defina.
- Solo debe haber **una instancia**: los trabajos corren dentro del proceso, y con varias instancias se duplicarían.

## 2. Web en Vercel

1. Vercel → **Add New → Project** → importe el mismo repositorio.
2. **Root Directory:** déjelo vacío (raíz del repositorio). El `vercel.json` ya define instalación, compilación (`packages/shared` y luego `apps/web`), carpeta de salida `apps/web/dist` y la regla para que las rutas del navegador (`/login`, `/admin/...`) no den 404.
3. En **Environment Variables** agregue (entornos Production y Preview):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon key (nunca la service_role) |
| `VITE_API_URL` | `https://<su-servicio>.onrender.com/api/v1` (sin barra final) |

   Las variables `VITE_` se incrustan al compilar: si las cambia, debe redesplegar.
4. **Deploy.** Al terminar, copie la URL de producción (por ejemplo `https://foest.vercel.app`).

## 3. Cerrar el círculo (URLs reales)

1. **Render → foest-api → Environment:** edite `WEB_ORIGIN` con la URL exacta de Vercel, sin barra final y con `https`. Guarde (redespliega solo). Si no coincide al carácter, el navegador bloqueará todas las llamadas por CORS. Con un dominio propio, use ese dominio.
2. **Supabase → Authentication → URL Configuration:**
   - **Site URL:** la URL de Vercel.
   - **Redirect URLs:** agregue `https://<su-dominio>/verificar-correo`, `https://<su-dominio>/restablecer` y `https://<su-dominio>/invitacion`.
3. **Supabase → Authentication → Providers → Email:** revise si exige confirmar el correo; el correo de verificación, restablecimiento e invitaciones lo envía Supabase y tiene límite por hora. Para volumen real configure un SMTP propio en Supabase → Authentication → SMTP Settings.

## 4. Primer administrador y comprobación

Con las variables de producción en `apps/api/.env` local (o exportadas), cree el primer administrador:

```bash
ADMIN_EMAIL=admin@su-dominio.gov.co ADMIN_PASSWORD='UnaClave#2026' npm run seed:admin
```

Luego en la URL de Vercel: inicie sesión con ese administrador, abra `/admin`, y siga el recorrido de `docs/GUIA_PRUEBAS.md` (sección 2). No cree los usuarios `prueba.*@foest.test` en producción.

## 5. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| Al iniciar sesión la pantalla no responde y la consola dice «CORS» | `WEB_ORIGIN` en Render no coincide exactamente con la URL de Vercel. Las URL de vista previa de Vercel (`...-git-rama-...vercel.app`) tampoco están permitidas: pruebe siempre con la de producción |
| `/login` recargado da 404 | Falta `vercel.json` en la raíz o el Root Directory no es la raíz |
| La web carga pero todo da error de red | `VITE_API_URL` mal escrita o sin redesplegar tras cambiarla |
| Error 503 `MIGRACION_PENDIENTE` | Falta aplicar alguna migración en Supabase |
| Los PDF fallan (GE-F041/F043/F038, resumen) | Poca memoria en Render (suba el plan) o revise los logs; la imagen usa `/usr/bin/chromium` |
| La primera petición tarda mucho | Plan Free dormido; use Starter |
| No llegan correos | `SMTP_*` vacío (solo van al log) o proveedor que rechaza el remitente `MAIL_FROM` |

## 6. Lo que no se pudo comprobar antes de entregar

- La imagen Docker no se construyó localmente (Docker Desktop estaba apagado). El primer despliegue en Render es la prueba real; si falla, el error aparece en el log de construcción.
- `vercel.json` no se probó contra Vercel, pero las órdenes que ejecuta (compilar `packages/shared` y `apps/web`) son las mismas que ya corren en local.
