import type { ColumnaConsolidado, FilaConsolidado, ResumenConsolidado, ValorCelda } from './export_reports.types';
import { dateAYmd, esNumeroValido, normalizarTelefono } from './sanitizacion';

/**
 * Escritor HTML del consolidado: documento HTML5 autocontenido (un solo archivo, sin recursos externos
 * y sin JavaScript). TODO valor dinamico (titulos de columna, criterios, celdas) pasa por `escaparHtml`;
 * los numeros se escriben como texto formateado. Las columnas llegan ya filtradas por `columnasPara`,
 * asi que las sensibles solo existen cuando el solicitante tiene el permiso.
 */

export interface CriterioFila {
  criterio: string;
  valor: string;
}

export interface MetadatosHtml {
  convocatoria: string;
  /** Solo el rol del solicitante (sin datos personales adicionales). */
  generadoPorRol: string;
  generadoEn: Date;
  /** Tope defensivo del tamano del documento en bytes (por defecto 25 MB). */
  maxBytes?: number;
}

export const MAX_BYTES_HTML_DEFECTO = 25 * 1024 * 1024;
export const LEYENDA_LEY_1581 = 'Documento con datos personales protegidos por la Ley 1581 de 2012. Uso exclusivo del FOEST.';

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

export class HtmlDemasiadoGrandeError extends Error {
  constructor(readonly bytes: number, readonly maximo: number) {
    super(`El consolidado HTML supera el tamaño máximo permitido (${Math.round(maximo / 1048576)} MB). Utilice el formato CSV.`);
    this.name = 'HtmlDemasiadoGrandeError';
  }
}

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escaparHtml(valor: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(valor ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"'`]/g, (ch) => ENTIDADES[ch] as string);
}

const FMT_FECHA = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const FMT_FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });
const FMT_ENTERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const FMT_DECIMAL = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT_MONEDA = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

function esNumerico(col: ColumnaConsolidado): boolean {
  return col.tipo === 'ENTERO' || col.tipo === 'DECIMAL' || col.tipo === 'MONEDA';
}

/** Texto plano (sin escapar) de una celda segun el tipo de columna. */
export function textoCelda(col: ColumnaConsolidado, valor: ValorCelda | undefined): string {
  if (valor === null || valor === undefined) return '';
  switch (col.tipo) {
    case 'ENTERO':
      return esNumeroValido(valor) ? FMT_ENTERO.format(Math.trunc(valor)) : '';
    case 'DECIMAL':
      return esNumeroValido(valor) ? FMT_DECIMAL.format(valor) : '';
    case 'MONEDA':
      return esNumeroValido(valor) ? FMT_MONEDA.format(valor) : '';
    case 'FECHA':
      return valor instanceof Date && !Number.isNaN(valor.getTime()) ? FMT_FECHA.format(valor) : '';
    case 'TELEFONO': {
      const texto = String(valor);
      return normalizarTelefono(texto) ?? texto;
    }
    case 'TEXTO':
    default:
      return valor instanceof Date ? dateAYmd(valor) : String(valor);
  }
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.4}
header.cabecera{background:#238dc1;color:#fff;padding:20px 24px}
header.cabecera h1{margin:0 0 4px;font-size:22px}
header.cabecera p{margin:2px 0;font-size:14px}
main{padding:16px 24px}
section{margin:0 0 24px}
h2{font-size:16px;margin:0 0 8px;color:#000;border-bottom:2px solid #238dc1;padding-bottom:4px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #000;padding:4px 8px;text-align:left;vertical-align:top;font-weight:normal}
thead th{background:#238dc1;color:#fff;font-weight:bold}
tbody tr:nth-child(even){background:rgba(35,141,193,.1)}
.num{text-align:right;white-space:nowrap}
.kv th{width:42%;font-weight:bold;background:rgba(35,141,193,.1);color:#000}
.tabla-datos{overflow-x:auto}
.tabla-datos table{font-size:12px}
footer{border-top:1px solid #000;padding:12px 24px;font-size:12px}
.vacio{font-style:italic}
@media print{
@page{size:A4 landscape;margin:12mm}
body{font-size:11px}
header.cabecera{background:none;color:#000;border-bottom:3px solid #000;padding:0 0 8px}
thead{display:table-header-group}
thead th{background:none;color:#000}
tbody tr:nth-child(even){background:none}
.kv th{background:none}
tr{page-break-inside:avoid}
.tabla-datos{overflow:visible}
}
`.trim();

function tablaClaveValor(titulos: [string, string], filas: Array<[string, string]>, numericaDerecha = false): string {
  const cuerpo = filas
    .map(([k, v]) => `<tr><th scope="row">${escaparHtml(k)}</th><td${numericaDerecha ? ' class="num"' : ''}>${escaparHtml(v)}</td></tr>`)
    .join('');
  return `<table class="kv"><thead><tr><th scope="col">${escaparHtml(titulos[0])}</th><th scope="col">${escaparHtml(titulos[1])}</th></tr></thead><tbody>${cuerpo}</tbody></table>`;
}

export function generarHtml(
  columnas: ColumnaConsolidado[],
  filas: FilaConsolidado[],
  resumen: ResumenConsolidado,
  criterios: CriterioFila[],
  metadatos: MetadatosHtml,
): Buffer {
  const maximo = metadatos.maxBytes ?? MAX_BYTES_HTML_DEFECTO;
  const titulo = 'Consolidado de postulaciones';
  const cuando = FMT_FECHA_HORA.format(metadatos.generadoEn);

  const filasResumen: Array<[string, string]> = [['Total de expedientes', FMT_ENTERO.format(resumen.total)]];
  for (const [k, v] of Object.entries(resumen.por_estado)) filasResumen.push([`Estado: ${k}`, FMT_ENTERO.format(v)]);
  for (const [k, v] of Object.entries(resumen.por_tipo_solicitud)) filasResumen.push([`Tipo de trámite: ${k}`, FMT_ENTERO.format(v)]);
  for (const [k, v] of Object.entries(resumen.por_beneficio)) {
    filasResumen.push([`Beneficio ${k}: solicitudes`, FMT_ENTERO.format(v.solicitados)]);
    filasResumen.push([`Beneficio ${k}: aprobados`, FMT_ENTERO.format(v.aprobados)]);
  }
  filasResumen.push(['Monto aprobado total', FMT_MONEDA.format(resumen.monto_aprobado_total)]);

  const encabezados = columnas
    .map((col) => `<th scope="col"${esNumerico(col) ? ' class="num"' : ''}>${escaparHtml(col.titulo)}</th>`)
    .join('');

  const partes: string[] = [];
  partes.push(
    '<!DOCTYPE html>',
    '<html lang="es-CO">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="robots" content="noindex">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escaparHtml(`${titulo} - ${metadatos.convocatoria}`)}</title>`,
    `<style>${CSS}</style>`,
    '</head>',
    '<body>',
    '<header class="cabecera">',
    `<h1>${escaparHtml(titulo)}</h1>`,
    `<p>Convocatoria: ${escaparHtml(metadatos.convocatoria)}</p>`,
    `<p>Generado el ${escaparHtml(cuando)} (hora de Colombia) por ${escaparHtml(metadatos.generadoPorRol)}</p>`,
    '</header>',
    '<main>',
    `<section><h2>Criterios de filtro</h2>${tablaClaveValor(['Criterio', 'Valor'], criterios.map((c) => [c.criterio, c.valor]))}</section>`,
    `<section><h2>Resumen</h2>${tablaClaveValor(['Indicador', 'Valor'], filasResumen, true)}</section>`,
    `<section><h2>Expedientes (${escaparHtml(FMT_ENTERO.format(filas.length))})</h2><div class="tabla-datos"><table><thead><tr>${encabezados}</tr></thead><tbody>`,
  );

  let bytes = partes.reduce((a, p) => a + Buffer.byteLength(p, 'utf8'), 0);
  if (filas.length === 0) {
    partes.push(`<tr><td class="vacio" colspan="${Math.max(columnas.length, 1)}">Sin expedientes para los criterios indicados.</td></tr>`);
  }
  for (const fila of filas) {
    const celdas = columnas
      .map((col) => `<td${esNumerico(col) ? ' class="num"' : ''}>${escaparHtml(textoCelda(col, fila[col.clave]))}</td>`)
      .join('');
    const tr = `<tr>${celdas}</tr>`;
    bytes += Buffer.byteLength(tr, 'utf8');
    if (bytes > maximo) throw new HtmlDemasiadoGrandeError(bytes, maximo);
    partes.push(tr);
  }
  partes.push('</tbody></table></div></section>', '</main>', `<footer>${escaparHtml(LEYENDA_LEY_1581)}</footer>`, '</body>', '</html>');

  const buffer = Buffer.from(partes.join('\n'), 'utf8');
  if (buffer.length > maximo) throw new HtmlDemasiadoGrandeError(buffer.length, maximo);
  return buffer;
}
