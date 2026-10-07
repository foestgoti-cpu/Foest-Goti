/**
 * Lector CSV propio (sin dependencias) para la carga masiva de pagos.
 * Admite BOM, fin de linea CRLF/LF, campos entre comillas dobles (con "" escapado, comas y saltos de linea
 * dentro del campo) y delimitador coma o punto y coma (se detecta en la cabecera).
 */
export interface CsvLeido {
  cabecera: string[];
  /** Cada fila con su numero de linea logica (la cabecera es la fila 1). */
  filas: Array<{ fila: number; valores: string[] }>;
}

export function detectarDelimitador(texto: string): ',' | ';' {
  const primera = texto.split(/\r?\n/, 1)[0] ?? '';
  let comas = 0;
  let puntos = 0;
  let enComillas = false;
  for (const c of primera) {
    if (c === '"') enComillas = !enComillas;
    else if (!enComillas && c === ',') comas += 1;
    else if (!enComillas && c === ';') puntos += 1;
  }
  return puntos > comas ? ';' : ',';
}

export function parsearCsv(contenido: string): CsvLeido {
  const texto = contenido.replace(/^﻿/, '');
  const delim = detectarDelimitador(texto);
  const registros: string[][] = [];
  let campo = '';
  let registro: string[] = [];
  let enComillas = false;
  let hayContenido = false;

  const cerrarCampo = (): void => {
    registro.push(campo);
    campo = '';
  };
  const cerrarRegistro = (): void => {
    cerrarCampo();
    if (hayContenido || registro.length > 1 || (registro[0] ?? '').length > 0) registros.push(registro);
    registro = [];
    hayContenido = false;
  };

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i] as string;
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') {
      enComillas = true;
      hayContenido = true;
    } else if (c === delim) {
      cerrarCampo();
      hayContenido = true;
    } else if (c === '\r') {
      if (texto[i + 1] === '\n') i += 1;
      cerrarRegistro();
    } else if (c === '\n') {
      cerrarRegistro();
    } else {
      campo += c;
      hayContenido = true;
    }
  }
  if (enComillas) throw new Error('Comillas sin cerrar en el archivo CSV');
  if (campo.length > 0 || registro.length > 0 || hayContenido) cerrarRegistro();

  const [cab, ...resto] = registros;
  if (!cab) return { cabecera: [], filas: [] };
  const cabecera = cab.map((h) => h.trim().toLowerCase());
  const filas = resto.map((valores, idx) => ({ fila: idx + 2, valores: valores.map((v) => v.trim()) }));
  return { cabecera, filas };
}

/**
 * Neutraliza la inyeccion de formulas al exportar a CSV/Excel: antepone una comilla simple a los valores
 * que empiezan por = + - @ tab o retorno de carro.
 */
export function sanearCeldaCsv(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}
