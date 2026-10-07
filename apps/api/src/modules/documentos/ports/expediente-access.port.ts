import { logger, supabaseAdmin } from '../../../shared';

/**
 * Puerto `ExpedienteAccessPort`: decide si un funcionario puede ver los soportes de una postulacion.
 *
 * Implementacion real: `tieneAsignacionActiva` del modulo `asignaciones` (se resuelve de forma
 * perezosa, sin importacion estatica, para que `documentos` no dependa de su carga).
 * PROVISIONAL(asignaciones): mientras ese modulo no exporte la funcion se usa la funcion SQL
 * `fn_documento_acceso_funcionario` (0014), que consulta `postulacion_asignacion` con `to_regclass`
 * y, si la tabla no existe, la pertenencia vigente al comite (`asignacion_funcionario`).
 */
export interface ExpedienteAccessPort {
  funcionarioPuedeVer(funcionarioId: string, postulacionId: string): Promise<boolean>;
}

type TieneAsignacionActiva = (funcionarioId: string, postulacionId: string) => Promise<boolean>;

let cache: { fn: TieneAsignacionActiva | null; verificadoEn: number } | null = null;
const TTL_NO_ENCONTRADO_MS = 30_000;

function resolverAsignaciones(): TieneAsignacionActiva | null {
  const ahora = Date.now();
  if (cache && (cache.fn || ahora - cache.verificadoEn < TTL_NO_ENCONTRADO_MS)) return cache.fn;
  let fn: TieneAsignacionActiva | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const modulo = require('../../asignaciones') as { tieneAsignacionActiva?: unknown };
    if (typeof modulo.tieneAsignacionActiva === 'function') fn = modulo.tieneAsignacionActiva as TieneAsignacionActiva;
  } catch {
    fn = null;
  }
  cache = { fn, verificadoEn: ahora };
  return fn;
}

const implementacionPorDefecto: ExpedienteAccessPort = {
  async funcionarioPuedeVer(funcionarioId, postulacionId) {
    const real = resolverAsignaciones();
    if (real) return real(funcionarioId, postulacionId);
    const { data, error } = await supabaseAdmin.rpc('fn_documento_acceso_funcionario', {
      p_funcionario: funcionarioId,
      p_postulacion: postulacionId,
    });
    if (error) {
      logger.error({ err: error }, 'Fallo la verificacion de alcance del funcionario sobre el expediente');
      return false; // falla cerrada: sin alcance verificable no se entrega nada
    }
    return data === true;
  },
};

let puerto: ExpedienteAccessPort = implementacionPorDefecto;

export function obtenerExpedienteAccessPort(): ExpedienteAccessPort {
  return puerto;
}

/** Permite inyectar otra implementacion (pruebas, asignaciones). `null` restablece la de por defecto. */
export function setExpedienteAccessPort(p: ExpedienteAccessPort | null): void {
  puerto = p ?? implementacionPorDefecto;
}
