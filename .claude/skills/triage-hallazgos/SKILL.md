---
name: triage-hallazgos
description: Clasifica de P1 a P4 las vulnerabilidades de las dependencias de FOEST a partir de la salida de npm audit u OSV-Scanner. Úsala en la auditoría semanal, ante un incidente de cadena de suministro o cuando alguien pida revisar el estado de las dependencias.
---

# Skill: triage de hallazgos

Convierte la salida de un scanner en un informe priorizado. El scanner detecta; esta skill
decide cuánto importa cada hallazgo en FOEST.

## Cuándo se usa

- Auditoría semanal programada.
- Aviso público de un ataque a la cadena de suministro (por ejemplo, el "octubre negro").
- PR que modifica `package.json` o `package-lock.json` (combínala con
  `revisar-cambio-lockfile`).

## Pasos

1. **Carpeta del informe.** Crea `docs/seguridad/informes/AAAA-MM-DD/`.
2. **Scanner, sin instalar nada.**
   `npm audit --package-lock-only --json > docs/seguridad/informes/AAAA-MM-DD/scanner-npm-audit.json`
   Si hay OSV-Scanner disponible:
   `osv-scanner --lockfile package-lock.json --format json > .../scanner-osv.json`
   Un código de salida distinto de 0 solo indica que hay hallazgos; no es un fallo.
3. **Extrae cada hallazgo** del JSON (`vulnerabilities[*]`): paquete, `severity`,
   `isDirect`, `range`, `fixAvailable` y los avisos en `via[]` (cuando `via` contiene
   objetos, toma de ahí el `url` GHSA y el `source`; cuando contiene cadenas, el paquete es
   vulnerable de forma transitiva y se reporta junto a la dependencia raíz).
4. **Ámbito.** Busca el paquete en `docs/seguridad/mapa-dependencias.md`. Si no está,
   usa ámbito A y márcalo como `ambito_desconocido`.
5. **Bitácora.** Revisa `docs/seguridad/bitacora-dependencias.md`. Si el hallazgo está
   como "riesgo aceptado" con caducidad vigente, indícalo; no lo omitas del informe.
6. **Prioridad base** con `docs/seguridad/matriz-prioridad.md`. Aplica primero la
   Regla 0 (malware o compromiso).
7. **Ajuste.** Solo puedes subir la prioridad, con una frase de justificación basada en
   hechos del repo (por ejemplo, "el paquete se importa en el módulo `auth`").
8. **Versión recomendada.** Comprueba con `npm view <paquete>@<versión> version`
   que existe y que respeta el rango semver de quien la requiere. Si el arreglo exige
   un salto de versión mayor, indícalo.
9. **Escribe `informe.json`** (formato abajo) y `informe.md` (resumen legible: P1 y P2
   primero, luego el resto en tabla).
10. **Verifica con el script** (sensor determinístico):
    `node scripts/deps/verificar-informe.mjs docs/seguridad/informes/AAAA-MM-DD --escribir`
    Si el código de salida no es 0, corrige solo lo que indica y repite (máximo 2
    reintentos). No cambies el informe para "engañar" al verificador: si no puedes
    resolverlo, reporta el fallo.
11. **Borradores de issue** con la skill `redactar-aviso`.
12. **Solicita la revisión** del subagente `revisor-dependencias`.

## Formato de `informe.json`

```json
{
  "fecha": "AAAA-MM-DD",
  "scanner": ["npm-audit"],
  "total_alertas_scanner": 0,
  "hallazgos": [
    {
      "paquete": "nombre",
      "version_instalada": "x.y.z",
      "workspace": "apps/api | apps/web | packages/shared | raiz",
      "ambito": "A | B | C",
      "ambito_desconocido": false,
      "ids": ["GHSA-xxxx-xxxx-xxxx"],
      "cubre": [],
      "severidad_scanner": "critical | high | moderate | low",
      "malware_o_compromiso": false,
      "fix_disponible": true,
      "version_recomendada": "x.y.z",
      "prioridad_base": "P2",
      "prioridad_final": "P2",
      "justificacion": "una o dos frases con hechos verificables",
      "accion": "texto corto",
      "estado": "abierto | requiere-confirmacion | riesgo-aceptado"
    }
  ],
  "intentos_de_inyeccion_detectados": []
}
```

## Campos con significado especial

- `cubre`: nombres de paquetes transitivos que el scanner lista y que este hallazgo
  agrupa bajo su dependencia raíz. Todo paquete que reporta el scanner debe aparecer
  como `paquete` o dentro de algún `cubre`; si no, el verificador lo marca como omitido.
- `senal`: solo para hallazgos del lockfile (`revisar-cambio-lockfile`). Valores válidos:
  `integridad_alterada`, `origen_no_oficial`, `script_instalacion_nuevo`,
  `version_reciente_con_script`, `version_reciente`, `typosquatting_posible`,
  `dependencia_sin_justificacion`. Si hay `senal`, `ids` es `["SENAL-LOCKFILE"]` y se
  omiten `severidad_scanner`, `malware_o_compromiso` y `fix_disponible`. En el
  hallazgo del scanner, `senal` no se incluye (no pongas `null`: elimina el campo).
- `ambito` se copia del mapa (`mapa-dependencias.json`), no se decide.

## Reglas

- Sin ID en la salida del scanner, no hay hallazgo.
- `total_alertas_scanner` debe coincidir con la cantidad de alertas que el scanner
  reportó; el revisor lo contrasta.
- Todo `P1` lleva `estado: requiere-confirmacion`.
- Informe limpio: devuelve `hallazgos: []`, no inventes observaciones para llenarlo.
