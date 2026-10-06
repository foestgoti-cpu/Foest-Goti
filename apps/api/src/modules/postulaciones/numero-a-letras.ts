/**
 * Conversion de un entero no negativo a su texto en espanol (sin dependencia externa).
 * Uso principal: `valor_matricula_letras` del GE-F041, p. ej.
 *   numeroALetras(1250000) -> 'UN MILLON DOSCIENTOS CINCUENTA MIL'
 *   pesosEnLetras(1250000)  -> 'UN MILLON DOSCIENTOS CINCUENTA MIL PESOS M/CTE'
 * Soporta hasta 999.999.999.999.999 (cientos de billones, escala larga).
 */

const UNIDADES = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDOS',
  'VEINTITRES',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISEIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];

const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];

const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

/** 0..999 -> texto. `apocope` convierte UNO en UN (delante de MIL/MILLON). */
function centenasALetras(n: number, apocope: boolean): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c] as string);
  if (resto > 0) {
    if (resto < 30) {
      let u = UNIDADES[resto] as string;
      if (apocope && resto === 1) u = 'UN';
      if (apocope && resto === 21) u = 'VEINTIUN';
      partes.push(u);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      let texto = DECENAS[d] as string;
      if (u > 0) texto += ` Y ${apocope && u === 1 ? 'UN' : (UNIDADES[u] as string)}`;
      partes.push(texto);
    }
  }
  return partes.join(' ');
}

/** 0..999.999 -> texto (miles). */
function milesALetras(n: number, apocope: boolean): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles === 1) partes.push('MIL');
  else if (miles > 1) partes.push(`${centenasALetras(miles, true)} MIL`);
  if (resto > 0) partes.push(centenasALetras(resto, apocope));
  return partes.join(' ');
}

export function numeroALetras(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0 || !Number.isInteger(valor)) {
    throw new Error('numeroALetras requiere un entero no negativo');
  }
  if (valor === 0) return 'CERO';
  if (valor > 999_999_999_999_999) throw new Error('numeroALetras: valor fuera de rango');

  const billones = Math.floor(valor / 1_000_000_000_000);
  const millones = Math.floor((valor % 1_000_000_000_000) / 1_000_000);
  const resto = valor % 1_000_000;
  const partes: string[] = [];

  if (billones === 1) partes.push('UN BILLON');
  else if (billones > 1) partes.push(`${milesALetras(billones, true)} BILLONES`);

  if (millones === 1) partes.push('UN MILLON');
  else if (millones > 1) partes.push(`${milesALetras(millones, true)} MILLONES`);

  if (resto > 0) partes.push(milesALetras(resto, false));

  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

/** Texto legal del valor en pesos colombianos. */
export function pesosEnLetras(valor: number): string {
  const letras = numeroALetras(valor);
  // "UN PESO" para 1; en el resto se usa el plural con apocope de UNO final -> "VEINTIUN PESOS", "UN MILLON DE PESOS"
  if (valor === 1) return 'UN PESO M/CTE';
  const terminaEnMillonExacto = valor % 1_000_000 === 0 && valor >= 1_000_000;
  const base = letras.replace(/UNO$/, 'UN');
  return `${base}${terminaEnMillonExacto ? ' DE' : ''} PESOS M/CTE`;
}
