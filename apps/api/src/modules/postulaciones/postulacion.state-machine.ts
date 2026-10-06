import {
  esEstadoTerminal,
  buscarTransicion,
  TRANSICIONES_POSTULACION,
  type ActorTipo,
  type EstadoPostulacion,
  type MotivoTransicion,
} from '@foest/shared';
import { AppError } from '../../shared';

/**
 * Maquina de estados de la postulacion (DECISIONES.md seccion 4). La tabla vive en
 * `@foest/shared` (TRANSICIONES_POSTULACION); aqui se exponen las guardas que usa
 * `postulacion.service.transicionar()`. Cualquier par no listado -> 409 TRANSICION_INVALIDA.
 */
export { TRANSICIONES_POSTULACION };

export interface ActorTransicion {
  tipo: ActorTipo;
  /** uuid de `usuario`; ausente para SISTEMA. */
  id?: string | null;
}

export function validarTransicion(
  desde: EstadoPostulacion,
  hacia: EstadoPostulacion,
  motivo: MotivoTransicion,
  actor: ActorTransicion,
): void {
  if (esEstadoTerminal(desde)) {
    throw AppError.conflicto('TRANSICION_INVALIDA', `La postulacion esta en estado terminal ${desde}`);
  }
  const t = buscarTransicion(desde, hacia);
  if (!t) {
    throw AppError.conflicto('TRANSICION_INVALIDA', `No existe transicion de ${desde} a ${hacia}`);
  }
  if (!t.motivos.includes(motivo)) {
    throw AppError.conflicto('TRANSICION_INVALIDA', `El motivo ${motivo} no aplica para ${desde} -> ${hacia}`);
  }
  if (!t.actores.includes(actor.tipo)) {
    throw AppError.conflicto('TRANSICION_INVALIDA', `El actor ${actor.tipo} no puede ejecutar ${desde} -> ${hacia}`);
  }
  if (actor.tipo !== 'SISTEMA' && !actor.id) {
    throw AppError.conflicto('TRANSICION_INVALIDA', 'La transicion requiere el id del actor');
  }
}

/** Mapa de codigos de error lanzados por las funciones SQL (prefijo del mensaje) -> AppError. */
export function errorDesdeSql(mensaje: string | undefined): AppError {
  const texto = mensaje ?? '';
  if (/Could not find the function public\.fn_/i.test(texto)) {
    return new AppError(503, 'MIGRACION_PENDIENTE', 'Falta aplicar la migracion 0006_postulaciones.sql (funciones SQL del modulo)');
  }
  const codigo = texto.split(':')[0]?.trim() ?? '';
  switch (codigo) {
    case 'TRANSICION_INVALIDA':
    case 'VERSION_CONFLICTO':
    case 'PLAZO_SUBSANACION_VENCIDO':
      return AppError.conflicto(codigo, texto);
    case 'PERFIL_INCOMPLETO':
    case 'DATOS_INVALIDOS':
      return AppError.datosInvalidos(codigo, texto);
    case 'NO_ENCONTRADO':
      return AppError.noEncontrado();
    default:
      return AppError.interno(`Error en la operacion de postulacion: ${texto || 'sin detalle'}`);
  }
}
