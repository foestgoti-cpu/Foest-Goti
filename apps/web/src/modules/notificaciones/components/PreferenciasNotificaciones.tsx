import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Spinner } from '../../../components/ui';
import { useActualizarPreferencias, usePreferencias } from '../hooks/useNotificaciones';

/**
 * Preferencias minimas de correo. Los correos de seguridad de la cuenta, las solicitudes de
 * correccion, los plazos por vencer, los resultados y los avisos de otorgamiento no se desactivan.
 */
export function PreferenciasNotificaciones() {
  const pref = usePreferencias();
  const guardar = useActualizarPreferencias();
  const [recordatorios, setRecordatorios] = useState(true);
  const [informativos, setInformativos] = useState(true);

  useEffect(() => {
    if (pref.data) {
      setRecordatorios(pref.data.correo_recordatorios);
      setInformativos(pref.data.correo_informativos);
    }
  }, [pref.data]);

  const sinCambios = pref.data ? pref.data.correo_recordatorios === recordatorios && pref.data.correo_informativos === informativos : true;

  return (
    <Card titulo="Preferencias de correo">
      {pref.isLoading && <Spinner etiqueta="Cargando preferencias" />}
      {pref.error && <Alert tipo="error">{(pref.error as Error).message}</Alert>}
      {pref.data && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate({ correo_recordatorios: recordatorios, correo_informativos: informativos });
          }}
        >
          <Checkbox
            etiqueta="Recibir recordatorios por correo"
            descripcion="Recordatorios de postulaciones en borrador y avisos de apertura de convocatorias."
            checked={recordatorios}
            onChange={(e) => setRecordatorios(e.target.checked)}
          />
          <Checkbox
            etiqueta="Recibir avisos informativos por correo"
            descripcion="Confirmaciones de envio, cambios de estado informativos y suspensiones de convocatoria."
            checked={informativos}
            onChange={(e) => setInformativos(e.target.checked)}
          />
          <p className="text-sm text-ink/80">
            Siempre recibira por correo los avisos de seguridad de su cuenta, las solicitudes de correccion, los plazos por vencer, los resultados de su postulacion y los avisos sobre
            otorgamientos. El buzon de notificaciones de la plataforma siempre se mantiene actualizado.
          </p>
          {guardar.isSuccess && <Alert tipo="exito">Sus preferencias fueron guardadas.</Alert>}
          {guardar.error && <Alert tipo="error">{(guardar.error as Error).message}</Alert>}
          <div>
            <Button type="submit" cargando={guardar.isPending} disabled={sinCambios}>
              Guardar preferencias
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
