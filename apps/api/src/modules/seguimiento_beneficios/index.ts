/**
 * API publica del modulo `seguimiento_beneficios`:
 *   import { seguimientoRoutes, crearOtorgamientos, validarElegibilidad, montosPorConvocatoria } from '../seguimiento_beneficios';
 *
 * - `crearOtorgamientos` / `crearOtorgamiento`: los invoca evaluacion (puerto de otorgamientos) tras el dictamen.
 * - `validarElegibilidad` / `elegibilidadSeguimiento`: los consume postulaciones (ElegibilidadPort).
 * - `montosPorConvocatoria`: solo lectura para dashboards y reportes.
 * Dependencias: evaluacion y postulaciones importan este modulo; este modulo NO importa de ellos
 * (solo `postulaciones/datos-pago.service`, que no depende de nada del dominio).
 */
export { seguimientoRoutes } from './seguimiento_beneficios.routes';
export { seguimientoService } from './seguimiento_beneficios.service';
export { procesarCargaMasiva } from './seguimiento_beneficios.carga';
export { validarElegibilidad, elegibilidadSeguimiento, type ResultadoElegibilidadSeguimiento } from './seguimiento_beneficios.elegibilidad';
export { calcularCupos, montosPorConvocatoria } from './seguimiento_beneficios.cupos';
export { ejecutarAlertasCupos, iniciarJobsSeguimiento, detenerJobsSeguimiento } from './seguimiento_beneficios.jobs';
export type { CrearOtorgamientoEntrada, DecisionOtorgamiento, MontosConvocatoria, MontosBeneficio } from './seguimiento_beneficios.types';

import { seguimientoService } from './seguimiento_beneficios.service';
import type { DecisionOtorgamiento } from './seguimiento_beneficios.types';

/** Crea un otorgamiento por cada beneficio aprobado de la postulacion (idempotente por beneficio). */
export function crearOtorgamientos(postulacionId: string, decisiones: DecisionOtorgamiento[]): Promise<{ creados: number }> {
  return seguimientoService.crearOtorgamientos(postulacionId, decisiones);
}

/** Crea un unico otorgamiento (forma usada por el puerto de evaluacion). */
export const crearOtorgamiento = seguimientoService.crearOtorgamiento.bind(seguimientoService);
