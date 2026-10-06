import { useState } from 'react';
import { Alert, Modal, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { useExportarAuditoria } from '../hooks/useAuditoria';
import type { AuditoriaFiltros } from '../types';

const MOTIVO_MIN = 15;

/**
 * Solicita la exportacion CSV del conjunto filtrado. Exige motivo (minimo 15
 * caracteres) y confirmacion de doble intencion: la exportacion queda registrada
 * en la bitacora como EXPORTACION con filtros, conteo y motivo.
 */
export function ExportarAuditoriaModal({ abierto, filtros, onCerrar }: { abierto: boolean; filtros: AuditoriaFiltros; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const exportar = useExportarAuditoria();
  const motivoValido = motivo.trim().length >= MOTIVO_MIN;
  const filtrosActivos = Object.entries(filtros).filter(([, v]) => v !== undefined && v !== '');

  const cerrar = () => {
    setMotivo('');
    setResultado(null);
    onCerrar();
  };

  const confirmar = async () => {
    if (!motivoValido) return;
    setResultado(null);
    try {
      const nombre = await exportar.mutateAsync({ filtros, motivo: motivo.trim() });
      setResultado({ tipo: 'exito', texto: `Archivo ${nombre} generado. La exportacion quedo registrada en la bitacora.` });
    } catch (e) {
      const mensaje =
        e instanceof ApiRequestError && e.code === 'EXPORTACION_EXCESIVA'
          ? `${e.message}.`
          : e instanceof Error
            ? e.message
            : 'No fue posible generar la exportacion.';
      setResultado({ tipo: 'error', texto: mensaje });
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo="Exportar bitacora a CSV"
      onCerrar={cerrar}
      onConfirmar={resultado?.tipo === 'exito' ? undefined : confirmar}
      textoConfirmar="Exportar"
      textoCancelar={resultado?.tipo === 'exito' ? 'Cerrar' : 'Cancelar'}
      cargando={exportar.isPending}
      confirmacion={resultado?.tipo === 'exito' ? undefined : { palabra: 'EXPORTAR', comprension: 'Entiendo que esta exportacion contiene datos personales redactados y queda registrada en la auditoria con mi identidad y el motivo indicado.' }}
    >
      <p className="mb-3 text-sm">
        Se exportaran los eventos que coinciden con los filtros aplicados (maximo 10.000 filas). El archivo aplica la misma redaccion de campos sensibles que la bitacora y sanea las celdas contra formulas.
      </p>
      <dl className="mb-3 text-sm">
        <dt className="font-semibold">Filtros aplicados</dt>
        <dd>
          {filtrosActivos.length === 0 ? (
            'Sin filtros (toda la bitacora, sujeta al maximo de filas)'
          ) : (
            <ul className="list-disc pl-5">
              {filtrosActivos.map(([k, v]) => (
                <li key={k}>
                  <span className="font-mono text-xs">{k}</span>: {String(v)}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      <label htmlFor="exportar-motivo" className="mb-1 block text-sm font-semibold">
        Motivo de la exportacion (minimo {MOTIVO_MIN} caracteres)
      </label>
      <Textarea
        id="exportar-motivo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        invalido={motivo.length > 0 && !motivoValido}
        maxLength={2000}
        disabled={resultado?.tipo === 'exito'}
      />
      {motivo.length > 0 && !motivoValido && <p className="mt-1 text-xs">El motivo debe tener al menos {MOTIVO_MIN} caracteres.</p>}
      {!motivoValido && motivo.length === 0 && <p className="mt-1 text-xs text-ink/70">El boton Exportar se habilita al indicar el motivo y confirmar.</p>}
      {resultado && (
        <Alert tipo={resultado.tipo} className="mt-3">
          {resultado.texto}
        </Alert>
      )}
    </Modal>
  );
}
