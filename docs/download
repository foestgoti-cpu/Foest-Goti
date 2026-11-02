# Matriz de prioridad de dependencias

Fuente única para calcular P1 a P4. El agente y el revisor la aplican; un script puede
recalcularla. Si una regla no cubre un caso, se sube la prioridad y se registra en la
bitácora para ampliar esta matriz.

## Ámbitos (se asignan en `mapa-dependencias.md`)

| Ámbito | Qué es | Ejemplo en FOEST |
|---|---|---|
| **A** | Corre en producción en `apps/api` o en el código compartido que usa la API | Express, Prisma, autenticación, generación de PDF, correo, almacenamiento |
| **B** | Corre en producción solo en el navegador (`apps/web`) | React, TanStack Query, Recharts |
| **C** | Solo desarrollo, pruebas o compilación; no llega a producción | Jest, Vitest, Playwright, linters |

Si un paquete de `packages/shared` lo importa `apps/api`, es ámbito **A**.
Si el ámbito se desconoce, se trata como **A**.

## Regla 0: malware o compromiso (prevalece sobre todo)

Si el paquete o la versión instalada tiene un aviso de malware o de compromiso de
cuenta (IDs `MAL-`, avisos de malware de GitHub, o comunicado del proveedor) y la versión
instalada está en el rango afectado: **P1, en cualquier ámbito**.

Motivo: estos ataques se ejecutan al instalar. Una dependencia "solo de desarrollo" corre
en el equipo del desarrollador y en CI, donde hay tokens y credenciales. El ámbito C
no reduce el riesgo.

Acción: no instalar ni ejecutar; aislar el entorno afectado; rotar las credenciales que
hayan podido estar expuestas (tokens de GitHub, llaves de nube, secretos del `.env`);
confirmación humana.

## Regla 1: vulnerabilidades (CVE/GHSA) según severidad del scanner

| Severidad | Ámbito A | Ámbito B | Ámbito C |
|---|---|---|---|
| critical | **P1** | **P2** | **P3** |
| high | **P2** | **P2** | **P3** |
| moderate | **P3** | **P3** | **P4** |
| low | **P4** | **P4** | **P4** |
| info | **P4** | **P4** | **P4** |

## Regla 2: ajustes (solo hacia arriba)

- El aviso indica explotación activa o exploit público: sube un nivel (mínimo P1 si el
  ámbito es A).
- La dependencia procesa datos personales de beneficiarios, firma o valida tokens, o
  maneja archivos subidos: sube un nivel.
- Regla de techo: el agente nunca baja la prioridad. Solo una persona puede aceptar
  un riesgo, y se registra en la bitácora.

## Regla 3: sin arreglo disponible

La prioridad no cambia. La acción pasa a **mitigar o vigilar**: aislar la función,
añadir validación, reemplazar el paquete o fijar un recordatorio. Se registra en la
bitácora con responsable.

## Regla 4: riesgo aceptado

- Solo lo decide una persona (no el agente) y queda en la bitácora con responsable,
  fecha, motivo y **caducidad máxima de 30 días**.
- No aplica a la Regla 0.
- Un riesgo aceptado vencido se reabre automáticamente con su prioridad original.

## Acciones y plazos objetivo (ajustables por el equipo)

| Prioridad | Plazo objetivo | Quién |
|---|---|---|
| P1 | Mismo día | Responsable técnico confirma; el equipo ejecuta |
| P2 | 7 días | Desarrollador asignado |
| P3 | Próxima iteración | Desarrollador asignado |
| P4 | Mantenimiento regular | Se agrupa en el aviso semanal |

## Señales del lockfile (PR)

Se definen en la skill `revisar-cambio-lockfile`. Resumen: integridad alterada sin cambio
de versión = P1; origen fuera del registro oficial = P2; script de instalación nuevo no
permitido = P2; versión de menos de 7 días = P3.

## Función de prioridad (para el script de verificación)

```
si malware_o_compromiso:                       prioridad = P1
si no:  prioridad = TABLA[severidad][ambito]    # Regla 1
        si ajuste_explotacion o ajuste_datos:   subir un nivel (P1 es el tope)
```

Un script recalcula `prioridad_base` y compara. Una `prioridad_final` más baja que la
calculada es un error grave.
