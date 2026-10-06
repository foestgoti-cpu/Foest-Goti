import type { TipoSolicitud } from '@foest/shared';

/**
 * Puerto de elegibilidad del tramite (DECISIONES.md seccion 18).
 * Lo implementara `seguimiento_beneficios` (P2). Mientras tanto se usa la
 * implementacion provisional de abajo. `postulaciones` solo propaga el resultado
 * como `422 TRAMITE_NO_ELEGIBLE`.
 */
export interface ResultadoElegibilidad {
  elegible: boolean;
  motivo?: string;
}

export interface ElegibilidadPort {
  validar(beneficiarioId: string, convocatoriaId: string, tipo: TipoSolicitud): Promise<ResultadoElegibilidad>;
}

/**
 * Implementacion provisional P1:
 *  - PRIMERA_VEZ: siempre elegible.
 *  - RENOVACION / REINTEGRO: exige al menos una postulacion APROBADA previa del
 *    mismo beneficiario en otra convocatoria (`contarAprobadas`).
 * TODO(seguimiento_beneficios): reemplazar por la regla real (otorgamiento vigente,
 * labor social, promedio, etc.) cuando exista el modulo.
 */
export function crearElegibilidadProvisional(
  contarAprobadas: (beneficiarioId: string, convocatoriaId: string) => Promise<number>,
): ElegibilidadPort {
  return {
    async validar(beneficiarioId, convocatoriaId, tipo) {
      if (tipo === 'PRIMERA_VEZ') return { elegible: true };
      const n = await contarAprobadas(beneficiarioId, convocatoriaId);
      if (n > 0) return { elegible: true };
      return {
        elegible: false,
        motivo:
          tipo === 'RENOVACION'
            ? 'Para renovar debe contar con una postulacion aprobada en una convocatoria anterior'
            : 'Para reintegrar debe haber sido beneficiario aprobado en una convocatoria anterior',
      };
    },
  };
}
