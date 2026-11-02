# Bitácora de dependencias

Memoria del agente entre sesiones. Está versionada en el repo: cada cambio debe pasar por
PR. El agente puede leerla; solo una persona decide los riesgos aceptados.

## 1. Hallazgos y estado

| Fecha | Paquete | ID | Prioridad | Estado | Responsable | Nota |
|---|---|---|---|---|---|---|
| | | | | abierto / requiere-confirmacion / en-curso / resuelto | | |

Estados: `abierto`, `requiere-confirmacion` (todo P1 nace así), `en-curso`, `resuelto`.

## 2. Riesgos aceptados (los decide una persona)

Caducidad máxima: 30 días. No aplica a malware o compromiso (Regla 0).

| Paquete | ID | Prioridad original | Motivo | Responsable | Aceptado el | Caduca el |
|---|---|---|---|---|---|---|
| | | | | | | |

## 3. Scripts de instalación permitidos

Dependencias con `hasInstallScript: true` ya revisadas por una persona. Cualquier otra que
aparezca es P2 hasta que se revise.

| Paquete | Para qué lo necesita | Revisado por | Fecha | Versión revisada |
|---|---|---|---|---|
| Puppeteer | Descarga el navegador para generar PDF | | | |
| Prisma | Descarga los motores de base de datos | | | |
| bcrypt | Compila el módulo nativo (si aplica) | | | |

Verifiquen cuáles aplican con el comando del `mapa-dependencias.md`.

## 4. Registro de errores del agente (capítulo 7: mejora continua)

Cada error real del agente o del revisor se registra con el ciclo de dirección.
Todo error repetido debe terminar convertido en una regla, un ejemplo o una fila de la
matriz.

| Fecha | Caso | Observa (qué hizo mal) | Diagnostica (guía o sensor, y en qué capítulo) | Blinda (qué pieza se agregó o cambió) | Comprueba (sesión nueva: ¿volvió el error?) |
|---|---|---|---|---|---|
| | | | | | |

### Métricas por corrida

| Fecha | Alertas del scanner | Hallazgos en informe | Prioridad correcta | P1 degradados | IDs inventados | Reintentos | Veredicto del revisor |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

Metas: 90% de aciertos en prioridad, 0 P1 degradados, 0 IDs inventados.

## 5. Revisión semanal

Se revisan los 5 errores más frecuentes de la semana y se decide qué regla o ejemplo
se agrega. Se anota aquí la decisión y quién la tomó.

| Semana | Errores revisados | Cambio al arnés | Responsable |
|---|---|---|---|
| | | | |
