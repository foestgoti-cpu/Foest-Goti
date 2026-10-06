/**
 * Calendario de festivos de Colombia (Ley 51 de 1983, "Ley Emiliani").
 * Genera la propuesta de festivos de un anio para la carga anual y el script
 * `festivos:seed`. El administrador puede ajustarla antes de confirmar.
 */
export interface FestivoPropuesto {
  fecha: string;
  nombre: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(anio: number, mes: number, dia: number): string {
  return `${anio}-${pad(mes)}-${pad(dia)}`;
}

function sumar(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000).toISOString().slice(0, 10);
}

function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 domingo .. 6 sabado
}

/** Traslada al lunes siguiente si no cae en lunes (Ley Emiliani). */
function alLunes(fecha: string): string {
  const dow = diaSemana(fecha);
  if (dow === 1) return fecha;
  return sumar(fecha, dow === 0 ? 1 : 8 - dow);
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
export function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(anio, mes, dia);
}

export function festivosColombia(anio: number): FestivoPropuesto[] {
  const pascua = domingoDePascua(anio);
  const lista: FestivoPropuesto[] = [
    { fecha: iso(anio, 1, 1), nombre: 'Ano Nuevo' },
    { fecha: alLunes(iso(anio, 1, 6)), nombre: 'Dia de los Reyes Magos' },
    { fecha: alLunes(iso(anio, 3, 19)), nombre: 'Dia de San Jose' },
    { fecha: sumar(pascua, -3), nombre: 'Jueves Santo' },
    { fecha: sumar(pascua, -2), nombre: 'Viernes Santo' },
    { fecha: iso(anio, 5, 1), nombre: 'Dia del Trabajo' },
    { fecha: alLunes(sumar(pascua, 39)), nombre: 'Ascension del Senor' },
    { fecha: alLunes(sumar(pascua, 60)), nombre: 'Corpus Christi' },
    { fecha: alLunes(sumar(pascua, 68)), nombre: 'Sagrado Corazon de Jesus' },
    { fecha: alLunes(iso(anio, 6, 29)), nombre: 'San Pedro y San Pablo' },
    { fecha: iso(anio, 7, 20), nombre: 'Dia de la Independencia' },
    { fecha: iso(anio, 8, 7), nombre: 'Batalla de Boyaca' },
    { fecha: alLunes(iso(anio, 8, 15)), nombre: 'Asuncion de la Virgen' },
    { fecha: alLunes(iso(anio, 10, 12)), nombre: 'Dia de la Raza' },
    { fecha: alLunes(iso(anio, 11, 1)), nombre: 'Todos los Santos' },
    { fecha: alLunes(iso(anio, 11, 11)), nombre: 'Independencia de Cartagena' },
    { fecha: iso(anio, 12, 8), nombre: 'Inmaculada Concepcion' },
    { fecha: iso(anio, 12, 25), nombre: 'Navidad' },
  ];
  return lista.sort((x, y) => x.fecha.localeCompare(y.fecha));
}
