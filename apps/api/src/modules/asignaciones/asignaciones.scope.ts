import type { RequestHandler } from 'express';
import type { AlcanceExpediente } from '@foest/shared';
import { AppError, usuarioActual } from '../../shared';
import { asignacionesService } from './asignaciones.service';

export interface OpcionesExpedienteScope {
  /** `true` exige ser titular de una asignacion ACTIVA (operaciones de escritura). */
  escritura?: boolean;
}

/**
 * Resuelve el alcance del usuario sobre el expediente `req.params.id` (postulacion_id) contra la BD
 * en cada peticion (sin cache), de modo que reasignaciones y exclusiones apliquen de inmediato.
 *
 *  - FUNCIONARIO con asignacion ACTIVA propia      -> ESCRITURA.
 *  - FUNCIONARIO con asignacion LIBERADA propia    -> LECTURA_HISTORICA (solo si `escritura` no es true).
 *  - FUNCIONARIO excluido, sin asignacion o ajeno  -> 404.
 *  - ADMINISTRADOR                                 -> LECTURA (404 si `escritura: true`: no dictamina).
 *  - BENEFICIARIO                                  -> 403.
 * El resultado queda en `req.alcanceExpediente`.
 */
export async function resolverAlcanceExpediente(
  usuario: { id: string; rol: string },
  postulacionId: string,
  opciones: OpcionesExpedienteScope = {},
): Promise<AlcanceExpediente> {
  if (usuario.rol === 'ADMINISTRADOR') {
    if (opciones.escritura) throw AppError.noEncontrado();
    return 'LECTURA';
  }
  if (usuario.rol !== 'FUNCIONARIO') throw AppError.sinPermiso();

  if (await asignacionesService.esFuncionarioExcluido(usuario.id, postulacionId)) throw AppError.noEncontrado();
  if (await asignacionesService.tieneAsignacionActiva(usuario.id, postulacionId)) return 'ESCRITURA';
  if (!opciones.escritura && (await asignacionesService.tuvoAsignacion(usuario.id, postulacionId))) return 'LECTURA_HISTORICA';
  throw AppError.noEncontrado();
}

/** Middleware Express: protege toda ruta que abra o modifique un expediente (`:id` = postulacion_id). */
export function requireExpedienteScope(opciones: OpcionesExpedienteScope = {}): RequestHandler {
  return async (req, _res, next) => {
    try {
      const user = usuarioActual(req);
      const id = req.params.id;
      if (typeof id !== 'string' || id.length === 0) throw AppError.noEncontrado();
      const alcance = await resolverAlcanceExpediente(user, id, opciones);
      req.alcanceExpediente = { postulacion_id: id, alcance };
      next();
    } catch (e) {
      next(e);
    }
  };
}
