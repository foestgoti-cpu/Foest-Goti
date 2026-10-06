import { AppError, logger, supabaseAdmin } from '../../shared';
import { HTTP } from '@foest/shared';

/**
 * Fuerza bruta con dos contadores independientes (DECISIONES seccion 7) sobre
 * `public.intento_login`:
 *   - por IP:    20 intentos (exitosos o no) en 15 min -> 429 DEMASIADOS_INTENTOS
 *   - por email:  5 fallos en 15 min -> 429 CUENTA_BLOQUEADA_TEMPORAL (bloqueo 15 min)
 * El contador por email no depende de la IP: rotar IP no evade el bloqueo.
 */
export const VENTANA_MINUTOS = 15;
export const MAX_INTENTOS_IP = 20;
export const MAX_FALLOS_EMAIL = 5;

function desdeVentana(): string {
  return new Date(Date.now() - VENTANA_MINUTOS * 60 * 1000).toISOString();
}

async function contar(filtros: Record<string, string | boolean>): Promise<number> {
  let q = supabaseAdmin.from('intento_login').select('id', { count: 'exact', head: true }).gte('creado_en', desdeVentana());
  for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) {
    if (esTablaAusente(error)) {
      avisarTablaAusente();
      return 0;
    }
    throw AppError.interno(`No fue posible consultar intentos de acceso: ${error.message}`);
  }
  return count ?? 0;
}

/** `42P01` = relacion inexistente: la migracion 0002_auth.sql aun no esta aplicada. */
function esTablaAusente(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || /intento_login.*(does not exist|not find|schema cache)/i.test(error.message ?? '');
}
let avisado = false;
function avisarTablaAusente(): void {
  if (avisado) return;
  avisado = true;
  logger.warn('La tabla public.intento_login no existe (aplique supabase/migrations/0002_auth.sql): los contadores de fuerza bruta quedan inactivos');
}

export class ErrorBloqueo extends AppError {
  readonly retryAfterSeconds: number;
  constructor(code: string, message: string, retryAfterSeconds: number) {
    super(HTTP.DEMASIADAS_PETICIONES, code, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Lanza 429 si alguno de los dos contadores esta agotado. */
export async function verificarContadores(email: string, ip: string | null): Promise<void> {
  const retry = VENTANA_MINUTOS * 60;
  if (ip) {
    const porIp = await contar({ ip });
    if (porIp >= MAX_INTENTOS_IP) {
      throw new ErrorBloqueo('DEMASIADOS_INTENTOS', 'Demasiados intentos desde esta direccion; intente mas tarde', retry);
    }
  }
  const porEmail = await contar({ email, exitoso: false });
  if (porEmail >= MAX_FALLOS_EMAIL) {
    throw new ErrorBloqueo(
      'CUENTA_BLOQUEADA_TEMPORAL',
      'El acceso para este correo esta bloqueado temporalmente; intente en unos minutos',
      retry,
    );
  }
}

/** Registra un intento (exitoso o fallido). Un fallo al registrar no interrumpe el flujo. */
export async function registrarIntento(email: string, ip: string | null, exitoso: boolean): Promise<void> {
  await supabaseAdmin.from('intento_login').insert({ email, ip, exitoso });
}

/** `true` si con este fallo el email queda bloqueado (para auditar el bloqueo una sola vez). */
export async function quedaBloqueado(email: string): Promise<boolean> {
  const fallos = await contar({ email, exitoso: false });
  return fallos === MAX_FALLOS_EMAIL;
}
