# Mapa de dependencias de FOEST

Insumo del agente: le dice **dónde corre** cada paquete y **qué tan sensible** es.
Sin este mapa, el agente trata todo como ámbito A (lo más exigente) y genera ruido.

> **Fuente para el script:** `mapa-dependencias.json` (misma información, legible por
> máquina). El verificador lo usa para comprobar el ámbito de cada hallazgo. Si cambian
> una tabla, cambien la otra.
>
> **Estado: borrador.** La columna "Paquete en el repo" y el ámbito son propuestas
> basadas en el stack descrito en el README. Complétenlas con `package.json` y
> `package-lock.json` reales antes de usar el agente.

## Cómo completarlo

```bash
# Dependencias de producción de cada workspace
npm ls --omit=dev --depth=0 --workspace apps/api
npm ls --omit=dev --depth=0 --workspace apps/web
npm ls --omit=dev --depth=0 --workspace packages/shared

# Dependencias que ejecutan scripts al instalar
node -e "const l=require('./package-lock.json');for(const [k,v] of Object.entries(l.packages||{}))if(v.hasInstallScript)console.log(k||'(raíz)',v.version)"
```

Cada vez que un PR agregue una dependencia directa, se agrega una fila.

## Dependencias directas

| Función | Paquete en el repo | Workspace | Ámbito | Datos sensibles | Notas |
|---|---|---|---|---|---|
| Servidor HTTP | Express | apps/api | A | Sí (todas las rutas) | Propuesto |
| Cabeceras de seguridad | helmet | apps/api | A | No | Propuesto |
| ORM / base de datos | Prisma | apps/api | A | Sí (datos de beneficiarios) | Tiene script de instalación para sus motores; verificar |
| Tokens JWT RS256 | (completar) | apps/api | A | Sí (firma y llaves) | Subir un nivel si hay hallazgo |
| Hash de contraseñas | bcrypt | apps/api | A | Sí | Puede compilar código nativo al instalar; verificar |
| Colas y trabajos | BullMQ + cliente Redis | apps/api | A | Sí (correos, reportes) | Propuesto |
| Generación de PDF | Puppeteer | apps/api | A | Sí (formatos GE-F041/F043/F038 con datos personales) | Descarga Chromium al instalar: debe estar en la lista permitida |
| Plantillas | Handlebars | apps/api | A | Sí (renderiza datos personales) | Propuesto |
| Manipulación de PDF | pdf-lib | apps/api | A | Sí | Propuesto |
| Códigos QR | qrcode | apps/api | A | No | Propuesto |
| Antivirus de archivos | cliente de ClamAV (completar) | apps/api | A | Sí (archivos subidos) | Subir un nivel si hay hallazgo |
| Almacenamiento S3 | SDK de S3 (completar) | apps/api | A | Sí | Propuesto |
| Validación | Zod | packages/shared | A | No | Lo importa la API, por lo tanto A |
| Interfaz | React, Vite | apps/web | B | No | Vite también corre en desarrollo |
| Datos del cliente | TanStack Query | apps/web | B | No | Propuesto |
| Gráficos | Recharts | apps/web | B | No | Propuesto |
| Estilos | Tailwind | apps/web | C/B (verificar) | No | Normalmente solo compilación |
| Pruebas | Jest, Supertest, Vitest, React Testing Library, Playwright, k6 | varios | C | No | Siguen siendo P1 si hay malware (Regla 0) |

## Transitivas críticas a vigilar

Las transitivas heredan el ámbito de la dependencia directa que las trae. Si el scanner
reporta una transitiva, el informe nombra la raíz. Dejen aquí las que ya identificaron
como riesgosas:

- (completar tras la primera auditoría)

## Mantenimiento

- Responsable del mapa: (nombre)
- Última revisión: (fecha)
- Se revisa en cada PR que agregue una dependencia directa y en la revisión semanal.
