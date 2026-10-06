import type { ActorTipo, EstadoPostulacion, MotivoTransicion } from '../enums';

/**
 * Tabla de transiciones de la postulacion (DECISIONES.md seccion 4; fuente unica).
 * La consume el backend (`postulacion.state-machine.ts`) para validar y el
 * frontend para habilitar/deshabilitar botones.
 */
export interface Transicion {
  desde: EstadoPostulacion;
  hacia: EstadoPostulacion;
  motivos: readonly MotivoTransicion[];
  actores: readonly ActorTipo[];
}

export const TRANSICIONES_POSTULACION: readonly Transicion[] = [
  { desde: 'BORRADOR', hacia: 'PENDIENTE', motivos: ['ENVIO'], actores: ['BENEFICIARIO'] },
  { desde: 'PENDIENTE', hacia: 'EN_EVALUACION', motivos: ['TOMA'], actores: ['FUNCIONARIO'] },
  {
    desde: 'EN_EVALUACION',
    hacia: 'PENDIENTE',
    motivos: ['LIBERACION', 'CONFLICTO_INTERES', 'REASIGNACION'],
    actores: ['FUNCIONARIO', 'ADMINISTRADOR', 'SISTEMA'],
  },
  { desde: 'EN_EVALUACION', hacia: 'APROBADA', motivos: ['DICTAMEN_APROBADO'], actores: ['FUNCIONARIO'] },
  { desde: 'EN_EVALUACION', hacia: 'RECHAZADA', motivos: ['DICTAMEN_RECHAZADO'], actores: ['FUNCIONARIO'] },
  { desde: 'EN_EVALUACION', hacia: 'EN_CORRECCION', motivos: ['DICTAMEN_CORRECCION'], actores: ['FUNCIONARIO'] },
  { desde: 'EN_CORRECCION', hacia: 'PENDIENTE', motivos: ['SUBSANACION'], actores: ['BENEFICIARIO'] },
  { desde: 'EN_CORRECCION', hacia: 'RECHAZADA', motivos: ['VENCIMIENTO_SUBSANACION'], actores: ['SISTEMA'] },
  { desde: 'PENDIENTE', hacia: 'DESISTIDA', motivos: ['DESISTIMIENTO'], actores: ['BENEFICIARIO'] },
  { desde: 'EN_EVALUACION', hacia: 'DESISTIDA', motivos: ['DESISTIMIENTO'], actores: ['BENEFICIARIO'] },
  { desde: 'EN_CORRECCION', hacia: 'DESISTIDA', motivos: ['DESISTIMIENTO'], actores: ['BENEFICIARIO'] },
];

export function buscarTransicion(desde: EstadoPostulacion, hacia: EstadoPostulacion): Transicion | undefined {
  return TRANSICIONES_POSTULACION.find((t) => t.desde === desde && t.hacia === hacia);
}

export function transicionPermitida(desde: EstadoPostulacion, hacia: EstadoPostulacion, motivo: MotivoTransicion): boolean {
  const t = buscarTransicion(desde, hacia);
  return Boolean(t && t.motivos.includes(motivo));
}

/** Estados desde los que el beneficiario puede desistir. */
export const ESTADOS_DESISTIBLES: readonly EstadoPostulacion[] = ['PENDIENTE', 'EN_EVALUACION', 'EN_CORRECCION'];

/** Estados en los que el beneficiario puede editar el formulario. */
export const ESTADOS_EDITABLES: readonly EstadoPostulacion[] = ['BORRADOR', 'EN_CORRECCION'];

/**
 * Texto de estado en lenguaje claro para el beneficiario (beneficiario_dashboard.md).
 * Fuente unica para API y web.
 */
export function textoEstadoBeneficiario(estado: EstadoPostulacion, aprobacionParcial = false): string {
  switch (estado) {
    case 'BORRADOR':
      return 'Borrador sin enviar';
    case 'PENDIENTE':
      return 'Recibida, en espera de revision';
    case 'EN_EVALUACION':
      return 'En revision por el Comite FOEST';
    case 'EN_CORRECCION':
      return 'Documentos pendientes de correccion';
    case 'APROBADA':
      return aprobacionParcial ? 'Aprobada parcialmente: revise el resultado por beneficio' : 'Aprobada. Felicitaciones';
    case 'RECHAZADA':
      return 'No aprobada (revise las observaciones)';
    case 'DESISTIDA':
      return 'Desistida por usted';
    default:
      return estado;
  }
}
