import { useEffect, useState } from 'react';
import type { ResultadoReasignacionMasivoDto } from '@foest/shared';
import { Alert, FormField, Modal, Select } from '../../../components/ui';
import { useEvaluadores, useReasignarMasivo } from '../hooks/useAsignaciones';
import { mensajeError } from './AccionExpedienteModal';

interface Props {
  abierto: boolean;
  /** Origen preseleccionado (p. ej. desde la fila de un evaluador). */
  origenInicial?: string;
  onCerrar: () => void;
  onResultado: (r: ResultadoReasignacionMasivoDto) => void;
}

/** Reasignacion masiva: origen, destino opcional ("devolver al pool") y confirmacion de doble intencion. */
export function ReasignacionMasivaModal({ abierto, origenInicial, onCerrar, onResultado }: Props) {
  const { data: evaluadores, isLoading } = useEvaluadores(undefined, abierto);
  const masivo = useReasignarMasivo();
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setOrigen(origenInicial ?? '');
      setDestino('');
      setError(null);
    }
  }, [abierto, origenInicial]);

  const origenes = (evaluadores ?? []).map((e) => ({
    valor: e.funcionario_id,
    etiqueta: `${e.nombre} (${e.asignaciones_activas} activos)${e.activo ? '' : ' - inactivo'}`,
  }));
  const destinos = (evaluadores ?? [])
    .filter((e) => e.activo && e.funcionario_id !== origen)
    .map((e) => ({ valor: e.funcionario_id, etiqueta: e.nombre }));

  const confirmar = async () => {
    if (!origen) {
      setError('Seleccione el funcionario de origen.');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const r = await masivo.mutateAsync({ funcionario_origen_id: origen, funcionario_destino_id: destino || undefined });
      onResultado(r);
      onCerrar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo="Reasignacion masiva"
      onCerrar={onCerrar}
      onConfirmar={confirmar}
      textoConfirmar="Reasignar todo"
      cargando={cargando}
      confirmacion={{
        palabra: 'REASIGNAR TODO',
        comprension: 'Entiendo que se reasignaran todos los expedientes activos del funcionario de origen.',
      }}
    >
      <FormField etiqueta="Funcionario de origen" nombre="origen" obligatorio>
        <Select placeholder="Seleccione" opciones={origenes} value={origen} disabled={isLoading} onChange={(e) => setOrigen(e.target.value)} />
      </FormField>
      <FormField
        etiqueta="Funcionario destino"
        nombre="destino"
        ayuda="Si no elige ninguno, todos los expedientes vuelven al pool. Se omiten los expedientes cuya convocatoria no incluye al destino en su comite."
      >
        <Select placeholder="Devolver al pool" opciones={destinos} value={destino} disabled={isLoading} onChange={(e) => setDestino(e.target.value)} />
      </FormField>
      {error && <Alert tipo="error">{error}</Alert>}
    </Modal>
  );
}
