import { AppError, supabaseAdmin } from '../../shared';

/**
 * Utilidad de dias habiles (catalogos_configuracion.md, "Festivos y dias habiles").
 *
 * - Dia habil = lunes a viernes que no este en la tabla `festivo`.
 * - Todo se evalua en America/Bogota (UTC-5, sin horario de verano) sobre fechas
 *   locales `YYYY-MM-DD`; los instantes se convierten con `fechaLocalBogota`.
 * - Si el anio consultado no tiene festivos cargados, se lanza
 *   `FESTIVOS_NO_CARGADOS` (409): nunca se asume cero festivos.
 * - Espejo en SQL: fn_es_dia_habil / fn_sumar_dias_habiles / fn_dias_habiles_entre (0009).
 *
 * SUPUESTO: el .md pide date-fns/date-fns-tz; no estan instaladas y la zona es
 * fija (sin DST), por lo que basta aritmetica sobre Date.UTC.
 */
export const ZONA_BOGOTA = 'America/Bogota';
const OFFSET_BOGOTA = '-05:00';
const TTL_FESTIVOS_MS = 10 * 60_000;

export interface ProveedorFestivos {
  /** Conjunto de fechas `YYYY-MM-DD` festivas del anio; vacio si no hay carga. */
  festivosDelAnio(anio: number): Promise<Set<string>>;
}

const cacheFestivos = new Map<number, { fechas: Set<string>; vence: number }>();

const proveedorBD: ProveedorFestivos = {
  async festivosDelAnio(anio) {
    const ahora = Date.now();
    const c = cacheFestivos.get(anio);
    if (c && c.vence > ahora) return c.fechas;
    const { data, error } = await supabaseAdmin.from('festivo').select('fecha').eq('anio', anio);
    if (error) throw AppError.interno(`No fue posible leer los festivos de ${anio}: ${error.message}`);
    const fechas = new Set<string>(((data ?? []) as Array<{ fecha: string }>).map((f) => f.fecha));
    if (fechas.size > 0) cacheFestivos.set(anio, { fechas, vence: ahora + TTL_FESTIVOS_MS });
    return fechas;
  },
};

let proveedor: ProveedorFestivos = proveedorBD;

/** Permite inyectar un proveedor (pruebas) o volver al de BD. */
export function usarProveedorFestivos(p: ProveedorFestivos | null): void {
  proveedor = p ?? proveedorBD;
}

export function invalidarCacheFestivos(anio?: number): void {
  if (anio === undefined) cacheFestivos.clear();
  else cacheFestivos.delete(anio);
}

// --- Aritmetica de fechas locales -------------------------------------------

export function validarFechaLocal(fecha: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
    throw AppError.datosInvalidos('FECHA_INVALIDA', 'Se esperaba una fecha YYYY-MM-DD', { fecha });
  }
}

function aUtc(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return Date.UTC(a, m - 1, d);
}

function deUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function sumarDiasNaturales(fecha: string, dias: number): string {
  return deUtc(aUtc(fecha) + dias * 86_400_000);
}

export function anioDe(fecha: string): number {
  return Number(fecha.slice(0, 4));
}

/** Fecha local `YYYY-MM-DD` en America/Bogota de un instante. */
export function fechaLocalBogota(instante: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_BOGOTA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

/** Instante exclusivo siguiente al final del dia local (00:00 Bogota del dia siguiente). */
export function finDeDiaExclusivo(fecha: string): Date {
  return new Date(`${sumarDiasNaturales(fecha, 1)}T00:00:00${OFFSET_BOGOTA}`);
}

/** Ultimo instante del dia local (23:59:59.999 Bogota). */
export function finDeDia(fecha: string): Date {
  return new Date(finDeDiaExclusivo(fecha).getTime() - 1);
}

export function esFinDeSemana(fecha: string): boolean {
  const dow = new Date(aUtc(fecha)).getUTCDay();
  return dow === 0 || dow === 6;
}

async function festivosOFallo(anio: number): Promise<Set<string>> {
  const fechas = await proveedor.festivosDelAnio(anio);
  if (fechas.size === 0) {
    throw AppError.conflicto('FESTIVOS_NO_CARGADOS', `No hay festivos cargados para el anio ${anio}; el calculo de dias habiles no es confiable`, { anio });
  }
  return fechas;
}

// --- API publica ---------------------------------------------------------------

export async function esDiaHabil(fecha: string): Promise<boolean> {
  validarFechaLocal(fecha);
  if (esFinDeSemana(fecha)) return false;
  const festivos = await festivosOFallo(anioDe(fecha));
  return !festivos.has(fecha);
}

/** Siguiente dia habil estrictamente posterior (o la misma fecha si `inclusivo` y es habil). */
export async function siguienteDiaHabil(fecha: string, inclusivo = false): Promise<string> {
  validarFechaLocal(fecha);
  let f = inclusivo ? fecha : sumarDiasNaturales(fecha, 1);
  for (let i = 0; i < 400; i++) {
    if (await esDiaHabil(f)) return f;
    f = sumarDiasNaturales(f, 1);
  }
  throw AppError.interno('No fue posible hallar un dia habil');
}

/**
 * Suma `n` dias habiles. Si la fecha de partida no es habil, el conteo empieza el
 * siguiente dia habil (misma regla que fn_sumar_dias_habiles). Con n = 0 devuelve
 * la propia fecha si es habil o el siguiente dia habil.
 */
export async function sumarDiasHabiles(fecha: string, n: number): Promise<string> {
  validarFechaLocal(fecha);
  if (!Number.isInteger(n) || n < 0) throw AppError.datosInvalidos('DIAS_INVALIDOS', 'n debe ser un entero mayor o igual a 0', { n });
  if (n === 0) return siguienteDiaHabil(fecha, true);
  let f = fecha;
  let restan = n;
  while (restan > 0) {
    f = sumarDiasNaturales(f, 1);
    if (await esDiaHabil(f)) restan -= 1;
  }
  return f;
}

/** Dias habiles en el intervalo (desde, hasta]; 0 si hasta <= desde. */
export async function diasHabilesEntre(desde: string, hasta: string): Promise<number> {
  validarFechaLocal(desde);
  validarFechaLocal(hasta);
  if (aUtc(hasta) <= aUtc(desde)) return 0;
  let total = 0;
  let f = sumarDiasNaturales(desde, 1);
  while (aUtc(f) <= aUtc(hasta)) {
    if (await esDiaHabil(f)) total += 1;
    f = sumarDiasNaturales(f, 1);
  }
  return total;
}

// Alias en ingles (nombres que pide catalogos_configuracion.md)
export const isBusinessDay = esDiaHabil;
export const addBusinessDays = sumarDiasHabiles;
export const diffBusinessDays = diasHabilesEntre;
export const nextBusinessDay = siguienteDiaHabil;
