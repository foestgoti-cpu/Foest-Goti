/**
 * API publica del modulo `asignaciones` para los demas modulos:
 *
 *   import { requireExpedienteScope, tieneAsignacionActiva } from '../asignaciones';
 *
 * - `requireExpedienteScope({ escritura? })`: middleware; `req.params.id` = postulacion_id.
 * - `tieneAsignacionActiva`, `obtenerAsignacionActiva`, `esFuncionarioExcluido`: consultas.
 * - `liberarAsignacionActiva(postulacionId, motivo, actorId)`: cierra la ACTIVA sin tocar el estado
 *   de la postulacion (p. ej. DICTAMEN_EMITIDO desde evaluacion).
 * - `sincronizarComite`, `liberarPorDesistimiento`: hooks de convocatorias y postulaciones.
 * - `registrarMovimiento(postulacionId, funcionarioId?)`: actualiza `ultimo_movimiento_en` (chequeo, dictamen).
 */
import type { MotivoLiberacion } from '@foest/shared';
import { asignacionesService } from './asignaciones.service';

export { asignacionesRoutes } from './asignaciones.routes';
export { requireExpedienteScope, resolverAlcanceExpediente, type OpcionesExpedienteScope } from './asignaciones.scope';
export { codigoExpediente } from './asignaciones.service';

export function tieneAsignacionActiva(funcionarioId: string, postulacionId: string): Promise<boolean> {
  return asignacionesService.tieneAsignacionActiva(funcionarioId, postulacionId);
}

export function obtenerAsignacionActiva(postulacionId: string): Promise<{ id: string; funcionario_id: string } | null> {
  return asignacionesService.obtenerAsignacionActiva(postulacionId);
}

export function liberarAsignacionActiva(postulacionId: string, motivo: MotivoLiberacion, actorId: string | null): Promise<void> {
  return asignacionesService.liberarAsignacionActiva(postulacionId, motivo, actorId);
}

export function sincronizarComite(
  convocatoriaId: string,
  funcionarioId: string,
  accion: 'LIBERAR' | 'MANTENER',
): Promise<{ liberadas: number; afectadas: string[] }> {
  return asignacionesService.sincronizarComite(convocatoriaId, funcionarioId, accion);
}

export function liberarPorDesistimiento(postulacionId: string): Promise<void> {
  return asignacionesService.liberarPorDesistimiento(postulacionId);
}

export function esFuncionarioExcluido(funcionarioId: string, postulacionId: string): Promise<boolean> {
  return asignacionesService.esFuncionarioExcluido(funcionarioId, postulacionId);
}

export function registrarMovimiento(postulacionId: string, funcionarioId?: string): Promise<void> {
  return asignacionesService.registrarMovimiento(postulacionId, funcionarioId);
}
