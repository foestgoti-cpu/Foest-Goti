import type { EstadoConvocatoria } from '@foest/shared';
import { Badge, type TonoBadge } from '../../../components/ui';
import { ETIQUETA_ESTADO } from '../utils';

const TONO: Record<EstadoConvocatoria, TonoBadge> = {
  BORRADOR: 'neutro',
  HABILITADA: 'relleno',
  SUSPENDIDA: 'destacado',
  CERRADA: 'neutro',
  ARCHIVADA: 'neutro',
};

/** Estado persistido + estado operativo (abierta / vencida) en texto. */
export function EstadoConvocatoriaBadge({ estado, abierta }: { estado: EstadoConvocatoria; abierta?: boolean }) {
  const sufijo = estado === 'HABILITADA' && abierta === false ? ' (fuera de plazo)' : estado === 'HABILITADA' && abierta ? ' (abierta)' : '';
  return <Badge tono={TONO[estado]}>{ETIQUETA_ESTADO[estado] + sufijo}</Badge>;
}
