import { fechaLarga } from '../formato';
import type { HistorialItem } from '../types';

const TEXTO_MOTIVO: Record<string, string> = {
  CREACION: 'Borrador creado',
  ENVIO: 'Postulacion enviada',
  DICTAMEN_APROBADO: 'Resultado: aprobada',
  DICTAMEN_RECHAZADO: 'Resultado: no aprobada',
  DICTAMEN_CORRECCION: 'Se solicitaron correcciones',
  SUBSANACION: 'Correcciones enviadas',
  VENCIMIENTO_SUBSANACION: 'Plazo de correccion vencido',
  DESISTIMIENTO: 'Desistimiento registrado',
};

/** Linea de tiempo vertical sin identidad del evaluador (firma "Equipo FOEST"). */
export function HistorialTimeline({ items }: { items: HistorialItem[] }) {
  if (items.length === 0) return <p className="text-sm">Aun no hay movimientos registrados.</p>;
  return (
    <ol className="border-l-2 border-primary pl-4">
      {items.map((h) => (
        <li key={h.id} className="relative mb-5 last:mb-0">
          <span aria-hidden="true" className="absolute -left-[21px] top-1 h-3 w-3 border border-primary bg-white" />
          <p className="text-sm text-ink/70">{fechaLarga(h.cambiado_en)}</p>
          <p className="font-semibold">{TEXTO_MOTIVO[h.motivo] ?? h.estado_texto}</p>
          <p className="text-sm">
            Estado: {h.estado_texto}. Ciclo {h.ciclo}. Registrado por: {h.quien}.
          </p>
          {h.observaciones && <p className="mt-1 border-l-2 border-ink pl-2 text-sm">{h.observaciones}</p>}
        </li>
      ))}
    </ol>
  );
}
