import type { EstadoReporte } from '@foest/shared';
import { Badge, type TonoBadge } from '../../../components/ui';
import { TEXTO_ESTADO_REPORTE } from '../types';

const TONO: Record<EstadoReporte, TonoBadge> = {
  COLA: 'neutro',
  PROCESANDO: 'destacado',
  LISTO: 'relleno',
  FALLIDO: 'neutro',
  EXPIRADO: 'neutro',
};

export function EstadoReporteBadge({ estado }: { estado: EstadoReporte }) {
  return <Badge tono={TONO[estado]}>{TEXTO_ESTADO_REPORTE[estado]}</Badge>;
}
