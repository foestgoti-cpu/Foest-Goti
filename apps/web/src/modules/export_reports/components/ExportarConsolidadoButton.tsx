import { useState } from 'react';
import type { FiltrosConsolidado, FormatoConsolidado } from '@foest/shared';
import { Alert, Button, Modal } from '../../../components/ui';
import { usePermissions } from '../../roles_permissions';
import { useSolicitarConsolidado } from '../hooks/useReportes';
import { mensajeReporte } from '../utils';
import { ADVERTENCIA_DATOS_PERSONALES } from './SolicitarConsolidadoForm';

/** Boton reutilizable para solicitar el consolidado de una convocatoria desde otras pantallas. */
export function ExportarConsolidadoButton({
  convocatoriaId,
  formato = 'HTML',
  filtros,
  etiqueta,
}: {
  convocatoriaId: string;
  formato?: FormatoConsolidado;
  filtros?: FiltrosConsolidado;
  etiqueta?: string;
}) {
  const { can } = usePermissions();
  const m = useSolicitarConsolidado();
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  if (!can('reportes:solicitar')) return null;

  const enviar = async () => {
    setMensaje(null);
    try {
      const r = await m.mutateAsync({ convocatoriaId, formato, filtros });
      setMensaje({ tipo: 'exito', texto: r.sincrono ? 'El reporte esta listo en la seccion Reportes.' : 'Solicitud en cola; se le notificara al terminar.' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeReporte(e) });
    } finally {
      setAbierto(false);
    }
  };

  return (
    <span className="inline-flex flex-col gap-2">
      <Button variante="secundario" onClick={() => setAbierto(true)}>
        {etiqueta ?? `Exportar consolidado ${formato}`}
      </Button>
      {mensaje && <Alert tipo={mensaje.tipo}>{mensaje.texto}</Alert>}
      <Modal
        abierto={abierto}
        titulo="Confirmar exportacion"
        onCerrar={() => setAbierto(false)}
        onConfirmar={enviar}
        textoConfirmar="Generar consolidado"
        cargando={m.isPending}
        confirmacion={{ palabra: 'EXPORTAR', comprension: 'Entiendo que el archivo puede contener datos personales y que la exportacion queda auditada.' }}
      >
        <p>{ADVERTENCIA_DATOS_PERSONALES}</p>
      </Modal>
    </span>
  );
}
