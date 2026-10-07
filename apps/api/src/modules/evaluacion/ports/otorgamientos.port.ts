import type { CodigoBeneficio } from '@foest/shared';
import { AppError, logger, supabaseAdmin } from '../../../shared';
import { seguimientoService } from '../../seguimiento_beneficios/seguimiento_beneficios.service';

/**
 * Puerto de creacion de `otorgamiento` por beneficio aprobado (DECISIONES 14).
 *
 * PROVISIONAL(seguimiento_beneficios): inserta solo si la tabla `otorgamiento` existe; si no existe
 * (o su esquema aun no coincide) registra en el log y sigue. Cuando `seguimiento_beneficios` exista,
 * reemplazar por su `crearOtorgamiento` con `setOtorgamientosPort(...)`.
 */
export interface CrearOtorgamientoInput {
  postulacion_id: string;
  beneficio_codigo: CodigoBeneficio;
  convocatoria_id: string;
  monto_aprobado: number;
  revision_id: string;
}

export interface OtorgamientosPort {
  crear(input: CrearOtorgamientoInput): Promise<{ creado: boolean }>;
}

/** Errores de PostgREST/Postgres que indican tabla o columna ausente (modulo aun no construido). */
const CODIGOS_ESQUEMA_AUSENTE = new Set(['42P01', '42703', 'PGRST205', 'PGRST204']);

export function crearOtorgamientosPortProvisional(): OtorgamientosPort {
  return {
    async crear(input) {
      const { error } = await supabaseAdmin.from('otorgamiento').insert({
        postulacion_id: input.postulacion_id,
        beneficio_codigo: input.beneficio_codigo,
        convocatoria_id: input.convocatoria_id,
        monto_aprobado: input.monto_aprobado,
        estado: 'ACTIVO',
      });
      if (!error) return { creado: true };
      const codigo = (error as { code?: string }).code ?? '';
      if (codigo === '23505') return { creado: false };
      if (CODIGOS_ESQUEMA_AUSENTE.has(codigo)) {
        logger.warn(
          { beneficio: input.beneficio_codigo, postulacion_id: input.postulacion_id, codigo },
          'PROVISIONAL(seguimiento_beneficios): tabla otorgamiento no disponible; el otorgamiento no se creo',
        );
        return { creado: false };
      }
      throw AppError.interno(`No fue posible crear el otorgamiento: ${error.message}`);
    },
  };
}

/** Puerto real: delega en `seguimiento_beneficios` (evaluacion -> seguimiento_beneficios, nunca al reves). */
export function crearOtorgamientosPortSeguimiento(): OtorgamientosPort {
  return {
    async crear(input) {
      const r = await seguimientoService.crearOtorgamiento(input);
      return { creado: r.creado };
    },
  };
}

let otorgamientosPort: OtorgamientosPort = crearOtorgamientosPortSeguimiento();

export function setOtorgamientosPort(port: OtorgamientosPort): void {
  otorgamientosPort = port;
}

export function crearOtorgamiento(input: CrearOtorgamientoInput): Promise<{ creado: boolean }> {
  return otorgamientosPort.crear(input);
}
