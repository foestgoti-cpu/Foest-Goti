import { useState } from 'react';
import { Alert, Badge, Button, Card, Modal, Table } from '../../../components/ui';
import { useImportacionesSnies, useImportarSnies } from '../hooks/useSnies';
import type { ImportacionSnies, ResumenImportacionSnies } from '../types';
import { IesProgramaSelect, type SeleccionSnies } from './IesProgramaSelect';
import { fechaHora, mensajeDeError } from './formato';

/**
 * Carga del listado oficial SNIES (CSV): simulacion (valida sin escribir) e
 * importacion real con doble intencion; resumen de resultados, errores por fila
 * e historial de importaciones. Incluye un probador del selector IES/programa.
 */
export function SniesImportPanel() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacionSnies | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [page, setPage] = useState(1);
  const importar = useImportarSnies();
  const historial = useImportacionesSnies(page);
  const [seleccion, setSeleccion] = useState<SeleccionSnies>({ ies: null, programa: null });

  const ejecutar = async (modo: 'real' | 'simulacion') => {
    if (!archivo) return;
    setError(null);
    setResumen(null);
    try {
      const r = await importar.mutateAsync({ archivo, modo });
      setResumen(r);
    } catch (e) {
      setError(mensajeDeError(e, 'No fue posible procesar el archivo.'));
    } finally {
      setConfirmar(false);
    }
  };

  return (
    <>
      <Card
        titulo="Importar listado SNIES"
        className="mb-4"
        pie="Columnas esperadas: codigo y nombre de la IES, caracter, sector, codigo SNIES y nombre del programa, nivel de formacion, modalidad, estado, departamento y municipio de oferta. Los programas ausentes del listado se desactivan (nunca se borran)."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Archivo CSV del MEN</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="campo"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setResumen(null);
                setError(null);
              }}
            />
          </label>
          <Button variante="secundario" disabled={!archivo} cargando={importar.isPending && importar.variables?.modo === 'simulacion'} onClick={() => void ejecutar('simulacion')}>
            Simular (sin escribir)
          </Button>
          <Button disabled={!archivo} onClick={() => setConfirmar(true)}>
            Importar
          </Button>
        </div>
        {archivo && (
          <p className="mt-2 text-xs text-ink/70">
            {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB
          </p>
        )}
        {error && <Alert tipo="error" className="mt-3">{error}</Alert>}
        {resumen && (
          <Alert tipo={resumen.modo === 'SIMULACION' ? 'info' : 'exito'} titulo={resumen.modo === 'SIMULACION' ? 'Simulacion (no se escribio nada)' : 'Importacion realizada'} className="mt-3">
            <ul className="text-sm">
              <li>Filas leidas: {resumen.filas_leidas}</li>
              <li>
                Instituciones: {resumen.ies_insertadas} nuevas, {resumen.ies_actualizadas} actualizadas
              </li>
              <li>
                Programas: {resumen.insertados} nuevos, {resumen.actualizados} actualizados, {resumen.desactivados} desactivados
              </li>
              <li>Errores por fila: {resumen.errores.length}</li>
            </ul>
            {resumen.errores.length > 0 && (
              <details className="mt-2 text-sm">
                <summary>Ver errores</summary>
                <ul className="mt-1 max-h-48 overflow-y-auto font-mono text-xs">
                  {resumen.errores.slice(0, 200).map((e) => (
                    <li key={e.fila}>
                      fila {e.fila}: {e.mensaje}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Alert>
        )}
      </Card>
      <Card titulo="Historial de importaciones" className="mb-4">
        {historial.error && <Alert tipo="error" className="mb-3">{(historial.error as Error).message}</Alert>}
        <Table<ImportacionSnies>
          caption="Importaciones SNIES"
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', render: (i) => fechaHora(i.ejecutada_en) },
            { clave: 'archivo', titulo: 'Archivo', render: (i) => <span className="break-all">{i.archivo_nombre}</span> },
            { clave: 'modo', titulo: 'Modo', render: (i) => <Badge tono={i.modo === 'REAL' ? 'relleno' : 'neutro'}>{i.modo}</Badge> },
            { clave: 'insertados', titulo: 'Nuevos', alineacion: 'derecha', render: (i) => i.insertados },
            { clave: 'actualizados', titulo: 'Actualizados', alineacion: 'derecha', render: (i) => i.actualizados },
            { clave: 'desactivados', titulo: 'Desactivados', alineacion: 'derecha', render: (i) => i.desactivados },
            { clave: 'errores', titulo: 'Errores', alineacion: 'derecha', render: (i) => (Array.isArray(i.errores) ? i.errores.length : 0) },
            { clave: 'sha', titulo: 'SHA-256', render: (i) => <span className="font-mono text-xs">{i.sha256_archivo.slice(0, 12)}...</span> },
          ]}
          filas={historial.data?.data ?? []}
          obtenerId={(i) => i.id}
          cargando={historial.isLoading}
          paginacion={historial.data ? { page: historial.data.page, page_size: historial.data.page_size, total: historial.data.total, onCambiarPagina: setPage } : undefined}
          vacio={{ titulo: 'Sin importaciones', descripcion: 'Aun no se ha cargado el listado SNIES. Las busquedas del formulario no devolveran resultados hasta importarlo.' }}
        />
      </Card>
      <Card titulo="Probar la busqueda del catalogo" pie="Este selector es el que usa el formulario de postulacion (GE-F041) para validar el par institucion/programa.">
        <IesProgramaSelect valor={seleccion} onChange={setSeleccion} />
      </Card>
      <Modal
        abierto={confirmar}
        titulo="Importar listado SNIES"
        onCerrar={() => setConfirmar(false)}
        onConfirmar={() => ejecutar('real')}
        textoConfirmar="Importar"
        cargando={importar.isPending}
        confirmacion={{ palabra: 'IMPORTAR', comprension: 'Entiendo que se actualizara el catalogo SNIES, que los programas ausentes se desactivaran y que la operacion queda auditada.' }}
      >
        <p className="text-sm">
          Archivo: <strong>{archivo?.name}</strong>. Se recomienda ejecutar primero la simulacion para revisar el resumen y los errores por fila.
        </p>
      </Modal>
    </>
  );
}
