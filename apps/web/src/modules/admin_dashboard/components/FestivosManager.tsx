import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Input, Modal, Select, Table } from '../../../components/ui';
import { useCrearFestivo, useEliminarFestivo, useFestivos } from '../hooks/useConfiguracion';
import type { Festivo } from '../types';
import { fecha } from './formato';

export function FestivosManager() {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const { data, isLoading, error } = useFestivos(anio);
  const crear = useCrearFestivo();
  const eliminar = useEliminarFestivo();
  const [fechaNueva, setFechaNueva] = useState('');
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [aEliminar, setAEliminar] = useState<Festivo | null>(null);

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
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No fue posible registrar el festivo.' });
    }
  };

  const confirmarEliminar = async () => {
    if (!aEliminar) return;
    try {
      await eliminar.mutateAsync(aEliminar.id);
      setMensaje({ tipo: 'exito', texto: `Festivo ${aEliminar.nombre} eliminado.` });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No fue posible eliminar el festivo.' });
    } finally {
      setAEliminar(null);
    }
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
        acciones={
          <label className="text-sm">
            <span className="sr-only">Ano</span>
            <Select opciones={anios} value={String(anio)} onChange={(e) => setAnio(Number(e.target.value))} />
          </label>
        }
        pie="Los dias habiles (subsanaciones, alertas) excluyen sabados, domingos y los festivos de esta tabla."
      >
        {error && <Alert tipo="error" className="mb-3">{(error as Error).message}</Alert>}
        <Table<Festivo>
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
          vacio={{ titulo: 'Sin festivos cargados', descripcion: 'Registre los festivos del ano para que el calculo de dias habiles sea correcto.' }}
        />
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
    </>
  );
}
