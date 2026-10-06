import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Input, Modal, Select, Table } from '../../../components/ui';
import { useCargaAnualFestivos, useCrearFestivo, useDiasHabiles, useEliminarFestivo, useFestivos, useFestivosPropuesta } from '../hooks/useConfiguracion';
import type { FestivoItem, FestivoPropuesto } from '../types';
import { fecha, mensajeDeError } from './formato';

/**
 * Calendario anual de festivos: alta/baja individual, carga anual (propuesta
 * calculada segun la Ley Emiliani, editable, que reemplaza SOLO el anio elegido
 * con doble intencion) y calculadora de dias habiles.
 */
export function FestivosManager() {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const { data, isLoading, error } = useFestivos(anio);
  const crear = useCrearFestivo();
  const eliminar = useEliminarFestivo();
  const cargaAnual = useCargaAnualFestivos();
  const [fechaNueva, setFechaNueva] = useState('');
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [aEliminar, setAEliminar] = useState<FestivoItem | null>(null);
  const [cargando, setCargando] = useState(false);
  const [propuesta, setPropuesta] = useState<FestivoPropuesto[]>([]);
  const consultaPropuesta = useFestivosPropuesta(anio, cargando);
  const [desde, setDesde] = useState('');
  const [n, setN] = useState('5');
  const consultaDias = useDiasHabiles(desde, Number(n), /^\d{4}-\d{2}-\d{2}$/.test(desde) && Number.isInteger(Number(n)) && Number(n) >= 0);

  const anios = Array.from({ length: 5 }, (_, i) => anioActual - 1 + i).map((a) => ({ valor: String(a), etiqueta: String(a) }));

  const alCrear = async (e: FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    try {
      const f = await crear.mutateAsync({ fecha: fechaNueva, nombre: nombre.trim() });
      setMensaje({ tipo: 'exito', texto: `Festivo ${f.nombre} (${fecha(f.fecha)}) registrado.` });
      setFechaNueva('');
      setNombre('');
      if (f.anio !== anio) setAnio(f.anio);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err, 'No fue posible registrar el festivo.') });
    }
  };

  const confirmarEliminar = async () => {
    if (!aEliminar) return;
    try {
      await eliminar.mutateAsync(aEliminar.id);
      setMensaje({ tipo: 'exito', texto: `Festivo ${aEliminar.nombre} eliminado.` });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err, 'No fue posible eliminar el festivo.') });
    } finally {
      setAEliminar(null);
    }
  };

  const abrirCargaAnual = () => {
    setMensaje(null);
    setPropuesta(consultaPropuesta.data?.festivos ?? []);
    setCargando(true);
  };
  const listaCarga = propuesta.length > 0 ? propuesta : (consultaPropuesta.data?.festivos ?? []);

  const confirmarCargaAnual = async () => {
    try {
      const r = await cargaAnual.mutateAsync({ anio, festivos: listaCarga.filter((f) => f.fecha && f.nombre.trim().length >= 3) });
      setMensaje({ tipo: 'exito', texto: `Carga anual de ${r.anio}: ${r.eliminados} festivos reemplazados, ${r.insertados} registrados.` });
      setCargando(false);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(err, 'No fue posible realizar la carga anual.') });
      setCargando(false);
    }
  };

  const editarPropuesta = (idx: number, cambio: Partial<FestivoPropuesto>) => {
    setPropuesta(listaCarga.map((f, i) => (i === idx ? { ...f, ...cambio } : f)));
  };

  return (
    <>
      <Card titulo="Registrar festivo" className="mb-4">
        <form onSubmit={alCrear} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Fecha</span>
            <Input type="date" value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Nombre</span>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={3} maxLength={120} className="min-w-[16rem]" />
          </label>
          <Button type="submit" cargando={crear.isPending}>
            Registrar
          </Button>
        </form>
        {mensaje && <Alert tipo={mensaje.tipo} className="mt-3">{mensaje.texto}</Alert>}
      </Card>
      <Card
        titulo={`Festivos de ${anio}`}
        className="mb-4"
        acciones={
          <>
            <label className="text-sm">
              <span className="sr-only">Ano</span>
              <Select opciones={anios} value={String(anio)} onChange={(e) => setAnio(Number(e.target.value))} />
            </label>
            <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={abrirCargaAnual}>
              Carga anual
            </Button>
          </>
        }
        pie="Los dias habiles (subsanaciones, alertas) excluyen sabados, domingos y los festivos de esta tabla. Si falta un anio, el calculo de plazos se bloquea."
      >
        {error && <Alert tipo="error" className="mb-3">{(error as Error).message}</Alert>}
        <Table<FestivoItem>
          caption="Festivos del ano"
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', render: (f) => fecha(f.fecha) },
            { clave: 'nombre', titulo: 'Nombre', render: (f) => f.nombre },
            {
              clave: 'accion',
              titulo: 'Accion',
              render: (f) => (
                <Button variante="texto" className="min-h-[32px] px-2 py-0 text-sm" onClick={() => setAEliminar(f)}>
                  Eliminar
                </Button>
              ),
            },
          ]}
          filas={data?.data ?? []}
          obtenerId={(f) => f.id}
          cargando={isLoading}
          vacio={{ titulo: 'Sin festivos cargados', descripcion: 'Use "Carga anual" para registrar los festivos del ano y que el calculo de dias habiles sea correcto.' }}
        />
      </Card>
      <Card titulo="Calculadora de dias habiles" pie="Resultado: fecha final tras sumar n dias habiles; si la fecha de partida no es habil, el conteo empieza el siguiente dia habil.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Desde</span>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Dias habiles</span>
            <Input type="number" inputMode="numeric" min={0} max={365} value={n} onChange={(e) => setN(e.target.value)} className="w-28" />
          </label>
          <p className="text-sm">
            {consultaDias.isFetching && 'Calculando...'}
            {consultaDias.error && <span>{(consultaDias.error as Error).message}</span>}
            {consultaDias.data && !consultaDias.isFetching && (
              <>
                Resultado: <strong>{fecha(consultaDias.data.resultado)}</strong> (fin del dia en America/Bogota)
              </>
            )}
          </p>
        </div>
      </Card>
      <Modal
        abierto={aEliminar !== null}
        titulo="Eliminar festivo"
        onCerrar={() => setAEliminar(null)}
        onConfirmar={confirmarEliminar}
        textoConfirmar="Eliminar"
        cargando={eliminar.isPending}
        confirmacion={{ palabra: 'CONFIRMAR', comprension: 'Entiendo que el dia volvera a contar como habil y que la eliminacion queda auditada.' }}
      >
        {aEliminar && (
          <p>
            Se eliminara el festivo <strong>{aEliminar.nombre}</strong> del {fecha(aEliminar.fecha)}.
          </p>
        )}
      </Modal>
      <Modal
        abierto={cargando}
        titulo={`Carga anual de festivos ${anio}`}
        onCerrar={() => setCargando(false)}
        onConfirmar={confirmarCargaAnual}
        textoConfirmar="Reemplazar festivos del ano"
        cargando={cargaAnual.isPending}
        confirmacion={{ palabra: String(anio), comprension: `Entiendo que se eliminaran los festivos actuales de ${anio} y se reemplazaran por esta lista; la operacion queda auditada.` }}
      >
        <p className="mb-3 text-sm">Propuesta calculada segun la Ley 51 de 1983 (Ley Emiliani). Ajuste nombres o fechas antes de confirmar.</p>
        {consultaPropuesta.isLoading && <p className="text-sm">Calculando propuesta...</p>}
        <div className="max-h-72 overflow-y-auto border border-ink">
          <table className="w-full text-sm">
            <caption className="sr-only">Festivos propuestos</caption>
            <thead className="bg-primary-10">
              <tr>
                <th scope="col" className="px-2 py-1 text-left">Fecha</th>
                <th scope="col" className="px-2 py-1 text-left">Nombre</th>
              </tr>
            </thead>
            <tbody>
              {listaCarga.map((f, idx) => (
                <tr key={`${idx}-${f.fecha}`} className="border-t border-ink/30">
                  <td className="px-2 py-1">
                    <Input type="date" value={f.fecha} onChange={(e) => editarPropuesta(idx, { fecha: e.target.value })} className="min-h-[36px] py-1 text-sm" />
                  </td>
                  <td className="px-2 py-1">
                    <Input value={f.nombre} onChange={(e) => editarPropuesta(idx, { nombre: e.target.value })} className="min-h-[36px] py-1 text-sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  );
}
