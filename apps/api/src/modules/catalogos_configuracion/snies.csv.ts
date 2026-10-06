/**
 * Lector CSV minimo (RFC 4180: comillas, separador `,` o `;` autodetectado, BOM,
 * saltos CRLF/LF). SUPUESTO: el .md pide `csv-parse` en streaming y `multer`; no
 * estan instaladas y el listado del MEN cabe en memoria (decenas de MB), por lo
 * que se procesa en una pasada sobre el texto recibido.
 */
export interface FilaCsv {
  numero: number;
  valores: string[];
}

export function detectarSeparador(primeraLinea: string): string {
  const comas = (primeraLinea.match(/,/g) ?? []).length;
  const puntoComa = (primeraLinea.match(/;/g) ?? []).length;
  const tab = (primeraLinea.match(/\t/g) ?? []).length;
  if (tab > comas && tab > puntoComa) return '\t';
  return puntoComa > comas ? ';' : ',';
}

export function parsearCsv(contenido: string): { encabezados: string[]; filas: FilaCsv[] } {
  const texto = contenido.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/, 1)[0] ?? '';
  const sep = detectarSeparador(primera);

  const registros: string[][] = [];
  let actual: string[] = [];
  let campo = '';
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i] as string;
    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += ch;
      }
      continue;
    }
    if (ch === '"') {
      enComillas = true;
    } else if (ch === sep) {
      actual.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      actual.push(campo);
      registros.push(actual);
      actual = [];
      campo = '';
    } else {
      campo += ch;
    }
  }
  if (campo.length > 0 || actual.length > 0) {
    actual.push(campo);
    registros.push(actual);
  }

  const noVacios = registros.filter((r) => r.some((v) => v.trim() !== ''));
  const encabezados = (noVacios.shift() ?? []).map((h) => h.trim());
  const filas: FilaCsv[] = noVacios.map((valores, idx) => ({ numero: idx + 2, valores }));
  return { encabezados, filas };
}
