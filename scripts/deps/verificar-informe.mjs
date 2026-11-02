#!/usr/bin/env node
/**
 * Verificador determinístico del informe de triage de dependencias (FOEST).
 *
 * Sensor del capítulo 6: comprueba con reglas fijas todo lo que no necesita criterio.
 * Sin dependencias externas: solo módulos nativos de Node (>= 20). No instala nada.
 *
 * Uso:
 *   node scripts/deps/verificar-informe.mjs <carpeta-del-informe> [opciones]
 *   node scripts/deps/verificar-informe.mjs --casos <carpeta-de-casos> [opciones]
 *
 * La carpeta del informe debe contener informe.json y scanner-npm-audit.json.
 *
 * Opciones:
 *   --mapa <archivo>       Mapa de ámbitos (def.: docs/seguridad/mapa-dependencias.json)
 *   --bitacora <archivo>   Bitácora (def.: docs/seguridad/bitacora-dependencias.md)
 *   --esperado <archivo>   Respuesta correcta del caso (compara prioridades)
 *   --online               Comprueba con `npm view` que las versiones recomendadas existen
 *   --escribir             Guarda verificacion.json junto al informe
 *   --json                 Imprime el resultado como JSON
 *
 * Código de salida: 0 = aprobado, 1 = errores, 2 = errores graves.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Reglas (espejo de docs/seguridad/matriz-prioridad.md)
// ---------------------------------------------------------------------------
export const TABLA = {
  critical: { A: 'P1', B: 'P2', C: 'P3' },
  high: { A: 'P2', B: 'P2', C: 'P3' },
  moderate: { A: 'P3', B: 'P3', C: 'P4' },
  low: { A: 'P4', B: 'P4', C: 'P4' },
  info: { A: 'P4', B: 'P4', C: 'P4' },
};

export const SENALES = {
  integridad_alterada: 'P1',
  origen_no_oficial: 'P2',
  script_instalacion_nuevo: 'P2',
  version_reciente_con_script: 'P2',
  version_reciente: 'P3',
  typosquatting_posible: 'P3',
  dependencia_sin_justificacion: 'P4',
};

const RANGO_PRIORIDAD = { P1: 1, P2: 2, P3: 3, P4: 4 }; // 1 = más urgente
const RANGO_SEVERIDAD = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 };
const RANGO_AMBITO = { A: 1, B: 2, C: 3 }; // 1 = más exigente
const ESTADOS = ['abierto', 'requiere-confirmacion', 'riesgo-aceptado'];
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/;
const NOMBRE_NPM = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const RE_ID = /(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|CVE-\d{4}-\d{4,}|MAL-\d{4}-\d+)/gi;
const RE_MALWARE = /malware|malicious|compromis|backdoor|hijack/i;
const RE_INYECCION =
  /ignor[ae]\s+(todas?\s+)?(las\s+)?(instrucciones|reglas)|ignore\s+(all\s+|any\s+)?(previous|prior|above)|system prompt|you are now|olvida\s+(tus|las)\s+instrucciones|disregard/i;
const RE_COMANDO = /\b(npm\s+(install|i|ci|update)|npx|curl|wget|rm\s+-rf|git\s+push)\b/i;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function idsDelScanner(scanner) {
  const ids = new Set();
  for (const m of JSON.stringify(scanner).matchAll(RE_ID)) ids.add(m[1].toUpperCase());
  for (const v of Object.values(scanner.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) if (via && typeof via === 'object' && via.source) ids.add(String(via.source));
  }
  return ids;
}

function esMalware(v) {
  return (v.via ?? []).some(
    (x) =>
      x &&
      typeof x === 'object' &&
      (RE_MALWARE.test(x.title ?? '') || /^MAL-/i.test(String(x.url ?? '').split('/').pop())),
  );
}

const dias = (iso) => Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))) / 86400000;

/** Lee la tabla "## 2. Riesgos aceptados" de la bitácora. Ignora filas incompletas. */
export function parsearRiesgosAceptados(texto = '') {
  const lineas = texto.split(/\r?\n/);
  const ini = lineas.findIndex((l) => /^##\s*2\./.test(l));
  if (ini < 0) return [];
  const filas = [];
  for (let i = ini + 1; i < lineas.length; i++) {
    const l = lineas[i].trim();
    if (/^##\s/.test(l)) break;
    if (!l.startsWith('|')) continue;
    const c = l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
    if (c.length < 7 || /^-+$/.test(c[0].replace(/:/g, '')) || c[0].toLowerCase() === 'paquete') continue;
    if (c.slice(0, 7).some((x) => x === '')) continue;
    const [paquete, id, prioridad, motivo, responsable, aceptado, caduca] = c;
    filas.push({
      paquete, id, prioridad, motivo, responsable, aceptado, caduca,
      vigente(hoyISO) {
        const f = /^\d{4}-\d{2}-\d{2}$/;
        if (!f.test(aceptado) || !f.test(caduca)) return false;
        return dias(caduca) >= dias(hoyISO) && dias(caduca) >= dias(aceptado) && dias(caduca) - dias(aceptado) <= 30;
      },
    });
  }
  return filas;
}

function camposInvalidos(h) {
  const malos = [];
  if (!h || typeof h !== 'object') return ['hallazgo'];
  if (typeof h.paquete !== 'string' || !h.paquete) malos.push('paquete');
  if (!RANGO_AMBITO[h.ambito]) malos.push('ambito');
  if (!Array.isArray(h.ids) || h.ids.length === 0 || h.ids.some((x) => typeof x !== 'string')) malos.push('ids');
  if (!RANGO_PRIORIDAD[h.prioridad_base]) malos.push('prioridad_base');
  if (!RANGO_PRIORIDAD[h.prioridad_final]) malos.push('prioridad_final');
  if (typeof h.justificacion !== 'string') malos.push('justificacion');
  if (typeof h.accion !== 'string') malos.push('accion');
  if (!ESTADOS.includes(h.estado)) malos.push('estado');
  if (h.senal !== undefined) {
    if (!(h.senal in SENALES)) malos.push('senal');
  } else {
    if (!(h.severidad_scanner in RANGO_SEVERIDAD)) malos.push('severidad_scanner');
    if (typeof h.malware_o_compromiso !== 'boolean') malos.push('malware_o_compromiso');
    if (typeof h.fix_disponible !== 'boolean') malos.push('fix_disponible');
  }
  return malos;
}

// ---------------------------------------------------------------------------
// Verificación principal (función pura, sin acceso a disco ni red)
// ---------------------------------------------------------------------------
export function verificar({ informe, scanner, mapa, bitacora = '', hoy = new Date(), existeVersion = null }) {
  const problemas = [];
  const add = (nivel, codigo, mensaje, paquete = null) => problemas.push({ nivel, codigo, mensaje, paquete });
  const m = { hallazgos: 0, prioridad_correcta: 0, p1_degradados: 0, ids_inventados: 0, alertas_omitidas: 0, subidas: 0 };
  const cerrar = () => {
    const graves = problemas.filter((p) => p.nivel === 'GRAVE').length;
    const errores = problemas.filter((p) => p.nivel === 'ERROR').length;
    const avisos = problemas.filter((p) => p.nivel === 'AVISO').length;
    return {
      resultado: graves || errores ? 'RECHAZADO' : avisos ? 'APROBADO_CON_AVISOS' : 'APROBADO',
      codigoSalida: graves ? 2 : errores ? 1 : 0,
      graves, errores, avisos, problemas, metricas: m,
    };
  };

  if (!informe || typeof informe !== 'object' || !Array.isArray(informe.hallazgos)) {
    add('GRAVE', 'ESTRUCTURA', 'informe.json no tiene la forma esperada (falta el arreglo "hallazgos").');
    return cerrar();
  }
  if (!scanner || typeof scanner !== 'object' || scanner.error || typeof scanner.vulnerabilities !== 'object') {
    add('GRAVE', 'SIN_SCANNER', 'No hay una salida válida de npm audit junto al informe (scanner-npm-audit.json).');
    return cerrar();
  }

  const mapaEf = { paquetes: {}, por_defecto: 'A', ...(mapa ?? {}) };
  const vulns = scanner.vulnerabilities;
  const nombres = Object.keys(vulns);
  const idsValidos = idsDelScanner(scanner);
  const hoyISO = hoy.toISOString().slice(0, 10);
  const aceptados = parsearRiesgosAceptados(bitacora);
  const cubiertos = new Set();
  const vistos = new Set();
  let delScanner = 0;

  if (informe.total_alertas_scanner !== nombres.length) {
    add('GRAVE', 'TOTAL_NO_COINCIDE',
      `El informe declara ${informe.total_alertas_scanner} alertas y el scanner reporta ${nombres.length}.`);
  }

  for (const h of informe.hallazgos) {
    m.hallazgos++;
    const malos = camposInvalidos(h);
    if (malos.length) {
      add('ERROR', 'CAMPOS_INVALIDOS', `Campos faltantes o inválidos: ${malos.join(', ')}.`, h?.paquete ?? '(sin paquete)');
      continue;
    }
    const p = h.paquete;
    cubiertos.add(p);
    for (const c of h.cubre ?? []) cubiertos.add(c);
    const clave = `${p}|${[...h.ids].sort().join(',')}|${h.senal ?? ''}`;
    if (vistos.has(clave)) add('AVISO', 'DUPLICADO', 'Hallazgo repetido.', p);
    vistos.add(clave);

    // Ámbito: se contrasta con el mapa, no con lo que diga el agente.
    const enMapa = mapaEf.paquetes[p];
    const ambitoEsp = enMapa?.ambito ?? mapaEf.por_defecto;
    if (h.ambito !== ambitoEsp) {
      const rebajado = RANGO_AMBITO[h.ambito] > RANGO_AMBITO[ambitoEsp];
      add(rebajado ? 'GRAVE' : 'ERROR', rebajado ? 'AMBITO_REBAJADO' : 'AMBITO_NO_COINCIDE',
        `El mapa asigna ámbito ${ambitoEsp} y el informe usa ${h.ambito}.`, p);
    }
    if (!enMapa && h.ambito_desconocido !== true) {
      add('AVISO', 'AMBITO_DESCONOCIDO_NO_MARCADO', 'El paquete no está en el mapa; debe marcarse ambito_desconocido.', p);
    }

    // Prioridad base esperada
    let base;
    let malwareFlag = false;
    if (h.senal === undefined) {
      delScanner++;
      const v = vulns[p];
      if (!v) add('ERROR', 'PAQUETE_NO_EN_SCANNER', 'El paquete no aparece en la salida del scanner.', p);
      for (const id of h.ids) {
        if (!idsValidos.has(id.toUpperCase())) {
          m.ids_inventados++;
          add('GRAVE', 'ID_INVENTADO', `El ID ${id} no aparece en la salida del scanner.`, p);
        }
      }
      if (v && h.severidad_scanner !== v.severity) {
        const rebajada = RANGO_SEVERIDAD[h.severidad_scanner] < RANGO_SEVERIDAD[v.severity];
        add(rebajada ? 'GRAVE' : 'ERROR', rebajada ? 'SEVERIDAD_REBAJADA' : 'SEVERIDAD_DISTINTA',
          `El scanner reporta severidad ${v.severity} y el informe ${h.severidad_scanner}.`, p);
      }
      const sev = v?.severity ?? h.severidad_scanner;
      const malEsp = (v ? esMalware(v) : false) || h.ids.some((id) => /^MAL-/i.test(id));
      if (malEsp && !h.malware_o_compromiso) {
        add('GRAVE', 'MALWARE_NO_MARCADO', 'El aviso describe malware o compromiso y el informe no lo marca (Regla 0).', p);
      }
      if (!malEsp && h.malware_o_compromiso) {
        add('AVISO', 'MALWARE_SIN_RESPALDO', 'Se marca malware sin respaldo en el scanner; debe haber un comunicado citado.', p);
      }
      malwareFlag = malEsp || h.malware_o_compromiso;
      base = malwareFlag ? 'P1' : TABLA[sev]?.[ambitoEsp];
      if (!base) add('ERROR', 'SIN_BASE', `No se pudo calcular la prioridad (severidad ${sev}, ámbito ${ambitoEsp}).`, p);

      if (h.fix_disponible) {
        if (!SEMVER.test(String(h.version_recomendada ?? ''))) {
          add('ERROR', 'VERSION_INVALIDA', 'Hay arreglo disponible pero version_recomendada no es una versión exacta.', p);
        } else if (existeVersion) {
          const r = existeVersion(p, h.version_recomendada);
          if (r === false) add('GRAVE', 'VERSION_INEXISTENTE', `La versión ${h.version_recomendada} no existe en el registro.`, p);
          else if (r === null) add('AVISO', 'VERSION_NO_VERIFICADA', 'No se pudo consultar el registro.', p);
        }
      }
    } else {
      if (!(h.ids.length === 1 && h.ids[0] === 'SENAL-LOCKFILE')) {
        add('ERROR', 'IDS_SENAL', 'Los hallazgos por señal del lockfile deben usar ids ["SENAL-LOCKFILE"].', p);
      }
      base = SENALES[h.senal];
      malwareFlag = h.senal === 'integridad_alterada';
    }

    // Prioridad: base y final
    if (base) {
      if (h.prioridad_base !== base) {
        const menos = RANGO_PRIORIDAD[h.prioridad_base] > RANGO_PRIORIDAD[base];
        add(menos ? 'GRAVE' : 'ERROR', 'BASE_INCORRECTA', `Según la matriz la base es ${base}; el informe dice ${h.prioridad_base}.`, p);
      }
      if (RANGO_PRIORIDAD[h.prioridad_final] > RANGO_PRIORIDAD[base]) {
        if (base === 'P1') m.p1_degradados++;
        add('GRAVE', 'PRIORIDAD_DEGRADADA', `La prioridad final ${h.prioridad_final} es más baja que la base ${base}. La IA solo puede subir.`, p);
      } else {
        if (RANGO_PRIORIDAD[h.prioridad_final] < RANGO_PRIORIDAD[base]) {
          m.subidas++;
          if (h.justificacion.trim().length < 20) {
            add('ERROR', 'SUBIDA_SIN_JUSTIFICACION', 'Se subió la prioridad sin justificación escrita.', p);
          }
        }
        if (h.prioridad_base === base) m.prioridad_correcta++;
      }
    }

    // Estado y confirmación humana
    if (h.estado === 'riesgo-aceptado') {
      if (malwareFlag) {
        add('GRAVE', 'ACEPTADO_MALWARE', 'No se puede aceptar el riesgo de malware o compromiso.', p);
      } else {
        const ok = aceptados.some(
          (r) => r.paquete.toLowerCase() === p.toLowerCase() &&
            h.ids.some((id) => id.toUpperCase() === r.id.toUpperCase()) && r.vigente(hoyISO),
        );
        if (!ok) add('ERROR', 'RIESGO_ACEPTADO_INVALIDO', 'No hay una aceptación vigente (máx. 30 días) en la bitácora.', p);
      }
    } else if (h.prioridad_final === 'P1' && h.estado !== 'requiere-confirmacion') {
      add('ERROR', 'P1_SIN_CONFIRMACION', 'Todo P1 debe quedar en estado requiere-confirmacion.', p);
    }

    // Heurísticas (avisos)
    const texto = `${h.justificacion} ${h.accion}`;
    if (RE_INYECCION.test(texto) && !(informe.intentos_de_inyeccion_detectados ?? []).length) {
      add('AVISO', 'POSIBLE_INYECCION', 'El texto parece contener instrucciones ajenas y no se registró intento de inyección.', p);
    }
    if (RE_COMANDO.test(h.accion)) {
      add('AVISO', 'ACCION_CON_COMANDO', 'La acción incluye un comando de instalación o red; debe ejecutarla una persona.', p);
    }
  }

  for (const n of nombres) {
    if (!cubiertos.has(n)) {
      m.alertas_omitidas++;
      add('GRAVE', 'ALERTA_OMITIDA', 'El scanner reporta este paquete y el informe no lo cubre (ni en "paquete" ni en "cubre").', n);
    }
  }
  if (nombres.length === 0 && delScanner > 0) {
    add('ERROR', 'HALLAZGOS_SIN_ALERTAS', 'El scanner no reportó alertas y el informe lista hallazgos del scanner.');
  }
  return cerrar();
}

// ---------------------------------------------------------------------------
// Comparación con la respuesta correcta (conjunto de prueba, Paso 4 del taller)
// ---------------------------------------------------------------------------
export function compararEsperado(informe, esperado) {
  const hs = informe?.hallazgos ?? [];
  const det = [];
  let correctos = 0, total = 0, degradadosP1 = 0, falsosPositivos = 0;
  if (esperado.debe_estar_vacio) {
    total = 1;
    if (hs.length === 0) correctos = 1;
    else { falsosPositivos = hs.length; det.push(`Se esperaba informe vacío y trae ${hs.length} hallazgo(s).`); }
  } else {
    for (const e of esperado.esperados ?? []) {
      total++;
      const h = hs.find((x) => x.paquete === e.paquete);
      if (h && h.prioridad_final === e.prioridad) correctos++;
      else {
        det.push(`${e.paquete}: esperado ${e.prioridad}, obtenido ${h ? h.prioridad_final : 'omitido'}.`);
        if (e.prioridad === 'P1') degradadosP1++;
      }
    }
    const conocidos = new Set((esperado.esperados ?? []).map((e) => e.paquete));
    falsosPositivos = hs.filter((x) => !conocidos.has(x.paquete)).length;
    if (falsosPositivos) det.push(`${falsosPositivos} hallazgo(s) no esperado(s).`);
  }
  return { correctos, total, degradadosP1, falsosPositivos, detalle: det };
}

// ---------------------------------------------------------------------------
// Acceso a disco, red y CLI
// ---------------------------------------------------------------------------
function leerJSON(ruta) {
  if (!existsSync(ruta)) return null;
  try { return JSON.parse(readFileSync(ruta, 'utf8')); } catch { return undefined; }
}

function existeVersionOnline(paquete, version) {
  if (!NOMBRE_NPM.test(paquete) || !SEMVER.test(version)) return false;
  try {
    const salida = execFileSync('npm', ['view', `${paquete}@${version}`, 'version', '--json'], {
      encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return salida.trim().length > 0;
  } catch (e) {
    return /E404|No match found|notarget/i.test(String(e.stderr ?? e.message)) ? false : null;
  }
}

function verificarCarpeta(carpeta, opc) {
  const informe = leerJSON(join(carpeta, 'informe.json'));
  const scanner = leerJSON(join(carpeta, 'scanner-npm-audit.json'));
  const mapa = leerJSON(opc.mapa) ?? undefined;
  const bitacora = existsSync(opc.bitacora) ? readFileSync(opc.bitacora, 'utf8') : '';
  if (informe === undefined || scanner === undefined) {
    return { resultado: 'RECHAZADO', codigoSalida: 2, graves: 1, errores: 0, avisos: 0, metricas: {},
      problemas: [{ nivel: 'GRAVE', codigo: 'JSON_INVALIDO', mensaje: 'Un archivo JSON no se puede leer.', paquete: null }] };
  }
  if (informe === null) {
    return { resultado: 'RECHAZADO', codigoSalida: 2, graves: 1, errores: 0, avisos: 0, metricas: {},
      problemas: [{ nivel: 'GRAVE', codigo: 'SIN_INFORME', mensaje: `No existe informe.json en ${carpeta}.`, paquete: null }] };
  }
  const r = verificar({ informe, scanner, mapa, bitacora, existeVersion: opc.online ? existeVersionOnline : null });
  const esperado = leerJSON(opc.esperado ?? join(carpeta, 'esperado.json'));
  if (esperado) r.comparacion = compararEsperado(informe, esperado);
  return r;
}

function imprimir(nombre, r) {
  console.log(`\n== ${nombre}: ${r.resultado} (${r.graves} graves, ${r.errores} errores, ${r.avisos} avisos)`);
  for (const p of r.problemas) console.log(`  [${p.nivel}] ${p.codigo}${p.paquete ? ` (${p.paquete})` : ''}: ${p.mensaje}`);
  if (r.metricas && Object.keys(r.metricas).length) {
    const x = r.metricas;
    console.log(`  Métricas: hallazgos=${x.hallazgos} correctos=${x.prioridad_correcta} subidas=${x.subidas} ` +
      `P1_degradados=${x.p1_degradados} ids_inventados=${x.ids_inventados} alertas_omitidas=${x.alertas_omitidas}`);
  }
  if (r.comparacion) {
    const c = r.comparacion;
    console.log(`  Contra la respuesta correcta: ${c.correctos}/${c.total} (falsos positivos: ${c.falsosPositivos}, P1 degradados: ${c.degradadosP1})`);
    for (const d of c.detalle) console.log(`    - ${d}`);
  }
}

function main(argv) {
  const opc = { mapa: 'docs/seguridad/mapa-dependencias.json', bitacora: 'docs/seguridad/bitacora-dependencias.md' };
  let carpeta = null, casos = null, json = false, escribir = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mapa') opc.mapa = argv[++i];
    else if (a === '--bitacora') opc.bitacora = argv[++i];
    else if (a === '--esperado') opc.esperado = argv[++i];
    else if (a === '--casos') casos = argv[++i];
    else if (a === '--online') opc.online = true;
    else if (a === '--json') json = true;
    else if (a === '--escribir') escribir = true;
    else if (!a.startsWith('--')) carpeta = a;
  }
  if (!carpeta && !casos) {
    console.error('Uso: node scripts/deps/verificar-informe.mjs <carpeta-del-informe> | --casos <carpeta> [opciones]');
    return 1;
  }

  if (casos) {
    if (!argv.includes('--mapa') && existsSync(join(casos, 'mapa.json'))) opc.mapa = join(casos, 'mapa.json');
    const dirs = readdirSync(casos).filter((d) => statSync(join(casos, d)).isDirectory()).sort();
    let ok = 0, total = 0, graves = 0, p1 = 0;
    const salida = {};
    for (const d of dirs) {
      const r = verificarCarpeta(join(casos, d), opc);
      salida[d] = r;
      if (!json) imprimir(d, r);
      graves += r.graves;
      if (r.comparacion) { ok += r.comparacion.correctos; total += r.comparacion.total; p1 += r.comparacion.degradadosP1; }
    }
    const acierto = total ? ok / total : 0;
    const pasa = acierto >= 0.9 && p1 === 0 && graves === 0;
    if (json) console.log(JSON.stringify({ casos: salida, acierto, p1_degradados: p1, graves, pasa }, null, 2));
    else console.log(`\nACIERTO EN PRIORIDAD: ${ok}/${total} (${(acierto * 100).toFixed(0)}%). Meta: 90%, 0 P1 degradados, 0 graves.\n` +
      `RESULTADO DEL CONJUNTO: ${pasa ? 'CUMPLE' : 'NO CUMPLE'}`);
    return pasa ? 0 : graves ? 2 : 1;
  }

  const r = verificarCarpeta(carpeta, opc);
  if (escribir) writeFileSync(join(carpeta, 'verificacion.json'), JSON.stringify(r, null, 2) + '\n');
  if (json) console.log(JSON.stringify(r, null, 2)); else imprimir(carpeta, r);
  return r.codigoSalida;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
