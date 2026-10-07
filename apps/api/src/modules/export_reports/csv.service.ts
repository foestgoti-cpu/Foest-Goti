import type { ColumnaConsolidado, FilaConsolidado, ValorCelda } from './export_reports.types';
import { dateAYmd, esNumeroValido, normalizarTelefono, sanitizarTextoCsv } from './sanitizacion';

/**
 * Escritor CSV (RFC 4180): UTF-8 con BOM, fin de linea CRLF, comillas dobles escapadas.
 * Solo el TEXTO se sanitiza contra formulas; numeros, monedas y fechas se escriben tipados.
 */
const BOM = '﻿';

function escaparCampo(s: string): string {
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function celdaCsv(columna: ColumnaConsolidado, valor: ValorCelda | undefined): string {
  if (valor === null || valor === undefined) return '';
  switch (columna.tipo) {
    case 'ENTERO':
      return esNumeroValido(valor) ? String(Math.trunc(valor)) : '';
    case 'DECIMAL':
    case 'MONEDA':
      return esNumeroValido(valor) ? String(valor) : '';
    case 'FECHA':
      return valor instanceof Date ? dateAYmd(valor) : '';
    case 'TELEFONO': {
      const texto = String(valor);
      const digitos = normalizarTelefono(texto);
      return escaparCampo(digitos ?? sanitizarTextoCsv(texto));
    }
    case 'TEXTO':
    default:
      return escaparCampo(sanitizarTextoCsv(valor instanceof Date ? dateAYmd(valor) : String(valor)));
  }
}

export function generarCsv(columnas: ColumnaConsolidado[], filas: FilaConsolidado[]): Buffer {
  const lineas: string[] = [columnas.map((col) => escaparCampo(col.titulo)).join(',')];
  for (const fila of filas) {
    lineas.push(columnas.map((col) => celdaCsv(col, fila[col.clave])).join(','));
  }
  return Buffer.from(`${BOM}${lineas.join('\r\n')}\r\n`, 'utf8');
}
