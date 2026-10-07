import { useState } from 'react';
import { ApiRequestError } from '../../../lib/api';
import { CARGA_PAGOS_MAX_FILAS, COLUMNAS_CSV_PAGOS, COLUMNAS_CSV_PAGOS_OBLIGATORIAS, type FilaCargaPagosResultado, type ResultadoCargaPagosDto } from '@foest/shared';
import { Alert, Button, Card, Checkbox, FormField, Input, PageHeader, Table } from '../../../components/ui';
import { useCargaMasiva } from '../hooks/useSeguimiento';
import { formatearMoneda, mensajeDeError } from '../utils';

/** `/admin/seguimiento/carga-pagos`: CSV, vista previa (dry run) y aplicacion todo o nada. */
export function CargaPagosPage() {
  const [archivo, setArchivo] = useState<{ nombre: string; contenido: string } | null>(null);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCargaPagosDto | null>(null);
  const [confirmo, setConfirmo] = useState(false);
  const m = useCargaMasiva();

  const seleccionar = async (f: File | undefined) => {
    setResultado(null);
    setConfirmo(false);
    m.reset();
    setErrorLectura(null);
    if (!f) return setArchivo(null);
    if (!/\.csv$/i.test(f.name)) {
      setArchivo(null);
      return setErrorLectura('Seleccione un archivo con extension .csv.');
    }
    setArchivo({ nombre: f.name, contenido: await f.text() });
  };

  const enviar = (aplicar: boolean) => {
    if (!archivo) return;
    m.mutate(
      { contenido_csv: archivo.contenido, nombre_archivo: archivo.nombre, dry_run: !aplicar, ...(aplicar ? { confirmar: true } : {}) },
      { onSuccess: setResultado },
    );
  };

  // 422 CARGA_CON_ERRORES trae el reporte por fila en `details`.
  const reporteError =
    m.error instanceof ApiRequestError && m.error.code === 'CARGA_CON_ERRORES' && m.error.details && typeof m.error.details === 'object' && Array.isArray((m.error.details as ResultadoCargaPagosDto).filas)
      ? (m.error.details as ResultadoCargaPagosDto)
      : null;
  const reporte = resultado ?? reporteError;
  const puedeAplicar = resultado && !resultado.aplicada && !resultado.ya_aplicada && resultado.filas_error === 0 && resultado.filas_total > 0;

  return (
    <>
      <PageHeader
        migas={[{ etiqueta: 'Seguimiento de beneficios', ruta: '/admin/seguimiento' }, { etiqueta: 'Carga masiva de pagos' }]}
        titulo="Carga masiva de pagos"
        descripcion="Cargue un archivo CSV con los pagos realizados. Primero se valida cada fila; solo se aplica si todas son correctas."
      />
      <Card titulo="Formato del archivo" className="mb-4">
        <p className="text-sm">
          Columnas admitidas: <span className="font-mono">{COLUMNAS_CSV_PAGOS.join(', ')}</span>. Obligatorias:{' '}
          <span className="font-mono">{COLUMNAS_CSV_PAGOS_OBLIGATORIAS.join(', ')}</span>. Identifique el otorgamiento con <span className="font-mono">otorgamiento_id</span> o con{' '}
          <span className="font-mono">postulacion_id</span> y <span className="font-mono">beneficio_codigo</span>.
        </p>
      </Card>
      <Card titulo="Archivo">
        <p className="mb-3 text-sm">Tamano maximo 1 MB y hasta {CARGA_PAGOS_MAX_FILAS} filas.</p>
        <FormField etiqueta="Archivo CSV" nombre="archivo" error={errorLectura}>
          <Input type="file" accept=".csv,text/csv" onChange={(e) => void seleccionar(e.target.files?.[0])} />
        </FormField>
        <Button onClick={() => enviar(false)} disabled={!archivo} cargando={m.isPending && !confirmo}>
          Validar archivo
        </Button>
      </Card>

      {m.error && !reporteError && <Alert tipo="error" className="mt-4">{mensajeDeError(m.error)}</Alert>}

      {reporte && (
        <div className="mt-6">
          {reporte.ya_aplicada ? (
            <Alert tipo="advertencia" className="mb-4">Este archivo ya fue aplicado anteriormente; no se registraron pagos nuevos.</Alert>
          ) : reporte.aplicada ? (
            <Alert tipo="exito" className="mb-4">La carga se aplico: {reporte.filas_ok} pago(s) registrados.</Alert>
          ) : reporte.filas_error > 0 ? (
            <Alert tipo="advertencia" className="mb-4">
              El archivo tiene {reporte.filas_error} fila(s) con errores de {reporte.filas_total}. Corrija el archivo y vuelva a validarlo; no se aplico ningun pago. Si una fila indica que el otorgamiento excede cupo o presupuesto, programe su primer desembolso de forma individual desde el detalle del otorgamiento.
            </Alert>
          ) : (
            <Alert tipo="info" className="mb-4">Vista previa correcta: {reporte.filas_ok} fila(s) listas para aplicar. Aun no se ha registrado ningun pago.</Alert>
          )}
          <Table<FilaCargaPagosResultado>
            caption="Resultado por fila"
            columnas={[
              { clave: 'fila', titulo: 'Fila', render: (f) => f.fila },
              { clave: 'ok', titulo: 'Resultado', render: (f) => (f.ok ? 'Correcta' : 'Con errores') },
              { clave: 'monto', titulo: 'Monto', alineacion: 'derecha', render: (f) => formatearMoneda(f.monto) },
              { clave: 'fecha', titulo: 'Fecha de pago', render: (f) => f.fecha_pago ?? '-' },
              { clave: 'ref', titulo: 'Referencia', render: (f) => f.referencia ?? '-' },
              { clave: 'err', titulo: 'Observaciones', render: (f) => (f.errores.length ? <ul>{f.errores.map((e) => <li key={e}>{e}</li>)}</ul> : '-') },
            ]}
            filas={reporte.filas}
            obtenerId={(f) => String(f.fila)}
          />
          {puedeAplicar && (
            <div className="mt-4 border border-ink p-4">
              <Checkbox etiqueta="Confirmo que los pagos del archivo son correctos y deseo registrarlos todos." checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
              <Button className="mt-3" disabled={!confirmo} cargando={m.isPending && confirmo} onClick={() => enviar(true)}>
                Aplicar carga
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
