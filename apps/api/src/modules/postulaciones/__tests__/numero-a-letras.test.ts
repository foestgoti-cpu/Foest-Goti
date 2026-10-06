import { numeroALetras, pesosEnLetras } from '../numero-a-letras';

describe('numeroALetras (valor de matricula en letras)', () => {
  it.each([
    [0, 'CERO'],
    [1, 'UNO'],
    [15, 'QUINCE'],
    [21, 'VEINTIUNO'],
    [30, 'TREINTA'],
    [45, 'CUARENTA Y CINCO'],
    [100, 'CIEN'],
    [101, 'CIENTO UNO'],
    [500, 'QUINIENTOS'],
    [999, 'NOVECIENTOS NOVENTA Y NUEVE'],
    [1000, 'MIL'],
    [1001, 'MIL UNO'],
    [21000, 'VEINTIUN MIL'],
    [100000, 'CIEN MIL'],
    [1000000, 'UN MILLON'],
    [1250000, 'UN MILLON DOSCIENTOS CINCUENTA MIL'],
    [2500300, 'DOS MILLONES QUINIENTOS MIL TRESCIENTOS'],
    [1000000000, 'MIL MILLONES'],
    [1000000000000, 'UN BILLON'],
  ])('%d -> %s', (n, esperado) => {
    expect(numeroALetras(n)).toBe(esperado);
  });

  it('rechaza valores negativos o no enteros', () => {
    expect(() => numeroALetras(-1)).toThrow();
    expect(() => numeroALetras(1.5)).toThrow();
  });

  it('pesosEnLetras agrega la leyenda legal y el DE en millones exactos', () => {
    expect(pesosEnLetras(1)).toBe('UN PESO M/CTE');
    expect(pesosEnLetras(21)).toBe('VEINTIUN PESOS M/CTE');
    expect(pesosEnLetras(3000000)).toBe('TRES MILLONES DE PESOS M/CTE');
    expect(pesosEnLetras(4850000)).toBe('CUATRO MILLONES OCHOCIENTOS CINCUENTA MIL PESOS M/CTE');
  });
});
