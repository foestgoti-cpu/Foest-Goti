import ExcelJS from 'exceljs';
import type { ColumnaConsolidado, FilaConsolidado, ResumenConsolidado, ValorCelda } from './export_reports.types';
import { esNumeroValido, normalizarTelefono } from './sanitizacion';

/**
 * Escritor XLSX con ExcelJS. Cada celda se escribe con tipo explicito (cadena, numero o fecha);
 * jamas se construye un objeto { formula } ni hipervinculos a partir de datos de usuario.
 * Estilo sobrio: encabezado azul #238dc1, texto negro, bordes finos.
 */
const AZUL = 'FF238DC1';
const NEGRO = 'FF000000';
const BORDE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: NEGRO } },
  left: { style: 'thin', color: { argb: NEGRO } },
  bottom: { style: 'thin', color: { argb: NEGRO } },
  right: { style: 'thin', color: { argb: NEGRO } },
};

export interface CriterioFila {
  criterio: string;
  valor: string;
}

function estilizarEncabezado(fila: ExcelJS.Row): void {
  fila.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: NEGRO } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    cell.border = BORDE;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });
}

function escribirCelda(cell: ExcelJS.Cell, columna: ColumnaConsolidado, valor: ValorCelda | undefined): void {
  cell.font = { color: { argb: NEGRO } };
  cell.border = BORDE;
  if (valor === null || valor === undefined) return;
  switch (columna.tipo) {
    case 'ENTERO':
      if (esNumeroValido(valor)) {
        cell.value = Math.trunc(valor);
        cell.numFmt = '0';
      }
      return;
    case 'DECIMAL':
      if (esNumeroValido(valor)) {
        cell.value = valor;
        cell.numFmt = '0.00';
      }
      return;
    case 'MONEDA':
      if (esNumeroValido(valor)) {
        cell.value = valor;
        cell.numFmt = '"$" #,##0';
      }
      return;
    case 'FECHA':
      if (valor instanceof Date) {
        cell.value = valor;
        cell.numFmt = 'yyyy-mm-dd';
      }
      return;
    case 'TELEFONO': {
      const texto = String(valor);
      cell.value = normalizarTelefono(texto) ?? texto;
      cell.numFmt = '@';
      return;
    }
    case 'TEXTO':
    default:
      cell.value = valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor);
      cell.numFmt = '@';
  }
}

function hojaClaveValor(hoja: ExcelJS.Worksheet, encabezados: [string, string], filas: Array<[string, string | number]>): void {
  hoja.columns = [{ width: 42 }, { width: 40 }];
  estilizarEncabezado(hoja.addRow(encabezados));
  for (const [k, v] of filas) {
    const fila = hoja.addRow([]);
    const a = fila.getCell(1);
    const b = fila.getCell(2);
    a.value = String(k);
    a.numFmt = '@';
    if (typeof v === 'number' && Number.isFinite(v)) {
      b.value = v;
    } else {
      b.value = String(v);
      b.numFmt = '@';
    }
    for (const cell of [a, b]) {
      cell.font = { color: { argb: NEGRO } };
      cell.border = BORDE;
      cell.alignment = { vertical: 'top', wrapText: true };
    }
  }
}

export async function generarXlsx(
  columnas: ColumnaConsolidado[],
  filas: FilaConsolidado[],
  resumen: ResumenConsolidado,
  criterios: CriterioFila[],
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'FOEST';
  libro.created = new Date();

  // Hoja de datos
  const datos = libro.addWorksheet('Expedientes', { views: [{ state: 'frozen', ySplit: 1 }] });
  datos.columns = columnas.map((col) => ({ width: col.ancho }));
  const encabezado = datos.addRow(columnas.map((col) => col.titulo));
  estilizarEncabezado(encabezado);
  encabezado.height = 30;
  for (const fila of filas) {
    const r = datos.addRow([]);
    columnas.forEach((col, i) => escribirCelda(r.getCell(i + 1), col, fila[col.clave]));
  }
  if (columnas.length > 0) datos.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

  // Hoja de resumen
  const hojaResumen = libro.addWorksheet('Resumen');
  const filasResumen: Array<[string, string | number]> = [['Total de expedientes', resumen.total]];
  for (const [k, v] of Object.entries(resumen.por_estado)) filasResumen.push([`Estado: ${k}`, v]);
  for (const [k, v] of Object.entries(resumen.por_tipo_solicitud)) filasResumen.push([`Tipo de trámite: ${k}`, v]);
  for (const [k, v] of Object.entries(resumen.por_beneficio)) {
    filasResumen.push([`Beneficio ${k}: solicitudes`, v.solicitados]);
    filasResumen.push([`Beneficio ${k}: aprobados`, v.aprobados]);
  }
  filasResumen.push(['Monto aprobado total (COP)', resumen.monto_aprobado_total]);
  hojaClaveValor(hojaResumen, ['Indicador', 'Valor'], filasResumen);

  // Hoja de criterios de filtro
  const hojaCriterios = libro.addWorksheet('Criterios');
  hojaClaveValor(
    hojaCriterios,
    ['Criterio', 'Valor'],
    criterios.map((c): [string, string] => [c.criterio, c.valor]),
  );

  const salida = await libro.xlsx.writeBuffer();
  return Buffer.from(salida as ArrayBuffer);
}
