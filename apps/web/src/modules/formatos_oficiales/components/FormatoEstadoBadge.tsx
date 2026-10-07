import { Badge } from '../../../components/ui';
import { EstadoVigenciaFormato, type ResumenFormatoDto } from '../types';

/** Estado de un formato: no generado / generando / vigente / desactualizado / fallido. */
export function FormatoEstadoBadge({ resumen }: { resumen: ResumenFormatoDto }) {
  const estado = resumen.formato?.estado;
  if (estado === 'GENERANDO') return <Badge tono="neutro">Generando</Badge>;
  if (resumen.situacion === EstadoVigenciaFormato.VIGENTE) return <Badge tono="relleno">Vigente</Badge>;
  if (resumen.situacion === EstadoVigenciaFormato.DESACTUALIZADO) return <Badge tono="destacado">Desactualizado: regenere y firme de nuevo</Badge>;
  if (estado === 'FALLIDO') return <Badge tono="neutro">Falló la generación</Badge>;
  return <Badge tono="neutro">No generado</Badge>;
}
