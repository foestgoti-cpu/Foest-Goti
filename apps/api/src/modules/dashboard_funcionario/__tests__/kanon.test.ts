import { aplicarKAnonimato, ETIQUETA_OTROS } from '../kanon';

describe('k-anonimato con supresion complementaria (umbral 5)', () => {
  it('no agrupa nada cuando todas las celdas alcanzan el umbral', () => {
    const r = aplicarKAnonimato([{ clave: 'SUP', total: 12 }, { clave: 'ST', total: 7 }], 5);
    expect(r.suprimido).toBe(false);
    expect(r.celdas_agrupadas).toBe(0);
    expect(r.items.map((i) => i.clave)).toEqual(['SUP', 'ST']);
  });

  it('una celda de 3 se agrupa en "Otros" y la supresion complementaria absorbe la menor celda visible', () => {
    // Con el total publicado (20 + 5 + 3 = 28), "Otros" = 3 seria deducible por resta y ademas
    // identificaria a la unica celda agrupada (ST). Se incorpora la menor visible (SUP = 5).
    const r = aplicarKAnonimato([{ clave: 'S11', total: 20 }, { clave: 'SUP', total: 5 }, { clave: 'ST', total: 3 }], 5);
    expect(r.suprimido).toBe(false);
    expect(r.items).toEqual([
      { clave: 'S11', total: 20, agrupado: false },
      { clave: ETIQUETA_OTROS, total: 8, agrupado: true },
    ]);
    expect(r.celdas_agrupadas).toBe(2);
    expect(r.items.some((i) => i.clave === 'ST' || i.clave === 'SUP')).toBe(false);
  });

  it('dos celdas pequenas cuya suma no alcanza el umbral siguen absorbiendo celdas visibles', () => {
    const r = aplicarKAnonimato([{ clave: 'A', total: 30 }, { clave: 'B', total: 9 }, { clave: 'C', total: 2 }, { clave: 'D', total: 1 }], 5);
    expect(r.items).toEqual([
      { clave: 'A', total: 30, agrupado: false },
      { clave: ETIQUETA_OTROS, total: 12, agrupado: true },
    ]);
    expect(r.celdas_agrupadas).toBe(3);
  });

  it('dos celdas pequenas que suman al menos el umbral forman "Otros" sin tocar las visibles', () => {
    const r = aplicarKAnonimato([{ clave: 'A', total: 10 }, { clave: 'B', total: 3 }, { clave: 'C', total: 2 }], 5);
    expect(r.items).toEqual([
      { clave: 'A', total: 10, agrupado: false },
      { clave: ETIQUETA_OTROS, total: 5, agrupado: true },
    ]);
  });

  it('total completo menor al umbral: suprimido y sin desglose', () => {
    const r = aplicarKAnonimato([{ clave: 'A', total: 2 }, { clave: 'B', total: 2 }], 5);
    expect(r.suprimido).toBe(true);
    expect(r.items).toEqual([]);
  });

  it('sin datos: lista vacia y no suprimido', () => {
    const r = aplicarKAnonimato([], 5);
    expect(r).toEqual({ items: [], suprimido: false, celdas_agrupadas: 0 });
  });
});
