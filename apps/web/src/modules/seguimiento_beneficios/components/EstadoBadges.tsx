import type { EstadoDesembolso, EstadoOtorgamiento } from '@foest/shared';
import { Badge } from '../../../components/ui';
import { ETIQUETA_ESTADO_DESEMBOLSO, ETIQUETA_ESTADO_OTORGAMIENTO, TONO_ESTADO_DESEMBOLSO, TONO_ESTADO_OTORGAMIENTO } from '../utils';

export function EstadoOtorgamientoBadge({ estado }: { estado: EstadoOtorgamiento }) {
  return <Badge tono={TONO_ESTADO_OTORGAMIENTO[estado]}>{ETIQUETA_ESTADO_OTORGAMIENTO[estado]}</Badge>;
}
export function EstadoDesembolsoBadge({ estado }: { estado: EstadoDesembolso }) {
  return <Badge tono={TONO_ESTADO_DESEMBOLSO[estado]}>{ETIQUETA_ESTADO_DESEMBOLSO[estado]}</Badge>;
}
