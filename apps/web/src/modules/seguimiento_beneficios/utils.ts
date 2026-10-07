import type { EstadoDesembolso, EstadoOtorgamiento, NivelAlertaCupo, TipoEventoOtorgamiento } from '@foest/shared';
import type { TonoBadge } from '../../components/ui';

import { BENEFICIOS_CATALOGO, type CodigoBeneficio } from '@foest/shared';
import { ApiRequestError } from '../../lib/api';
import { mensajeDeError as mensajeBase } from '../convocatorias/utils';

export { formatearFechaHora, formatearFechaLocal, formatearMoneda } from '../convocatorias/utils';

/** Mensaje legible de un error de la API; mapea el 403 de rol no autorizado. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 403) return 'Su rol no tiene acceso a esta funcion del seguimiento de beneficios.';
  return mensajeBase(error);
}

export function nombreBeneficio(codigo: CodigoBeneficio, nombre?: string | null): string {
  return BENEFICIOS_CATALOGO.find((b) => b.codigo === codigo)?.nombre ?? nombre ?? codigo;
}

export const ETIQUETA_ESTADO_OTORGAMIENTO: Record<EstadoOtorgamiento, string> = {
  ACTIVO: 'Activo',
  SUSPENDIDO: 'Suspendido',
  REVOCADO: 'Revocado',
  CUMPLIDO: 'Cumplido',
};
export const TONO_ESTADO_OTORGAMIENTO: Record<EstadoOtorgamiento, TonoBadge> = {
  ACTIVO: 'relleno',
  SUSPENDIDO: 'destacado',
  REVOCADO: 'neutro',
  CUMPLIDO: 'destacado',
};
export const ETIQUETA_ESTADO_DESEMBOLSO: Record<EstadoDesembolso, string> = { PROGRAMADO: 'Programado', PAGADO: 'Pagado', ANULADO: 'Anulado' };
export const TONO_ESTADO_DESEMBOLSO: Record<EstadoDesembolso, TonoBadge> = { PROGRAMADO: 'destacado', PAGADO: 'relleno', ANULADO: 'neutro' };

export const ETIQUETA_EVENTO: Record<TipoEventoOtorgamiento, string> = {
  CREADO: 'Otorgamiento creado',
  SUSPENDIDO: 'Otorgamiento suspendido',
  REACTIVADO: 'Otorgamiento reactivado',
  REVOCADO: 'Otorgamiento revocado',
  CUMPLIDO: 'Otorgamiento cumplido',
  CUPO_EXCEDIDO: 'Cupo excedido',
  PRESUPUESTO_EXCEDIDO: 'Presupuesto excedido',
  DESEMBOLSO_PROGRAMADO: 'Desembolso programado',
  DESEMBOLSO_PAGADO: 'Desembolso pagado',
  DESEMBOLSO_ANULADO: 'Desembolso anulado',
};

export const ETIQUETA_ALERTA: Record<NivelAlertaCupo, string> = { NORMAL: 'Normal', PREVENTIVA: 'Preventiva', EXCEDIDA: 'Excedida' };

export const MOTIVO_MINIMO = 15;

export function porcentaje(valor: number): string {
  return `${Number.isFinite(valor) ? Math.round(valor * 10) / 10 : 0} %`;
}
