import { useState } from 'react';
import { Alert, Badge, Button, Card, Input, Modal, Select, Table, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { useActualizarConfiguracion, useConfiguracion } from '../hooks/useConfiguracion';
import { CATEGORIAS_CONFIGURACION, CLAVES_NO_EDITABLES, ETIQUETA_CATEGORIA, type ConfiguracionItem } from '../types';
import { fechaHora, mensajeDeError } from './formato';

/**
 * Edicion de configuracion por categoria con doble intencion (modal con casilla +
 * palabra de confirmacion) y manejo del 409 VERSION_DESACTUALIZADA: se muestra el
 * valor y la version vigentes y se exige recargar antes de reintentar.
 */
const NO_EDITABLES = new Set<string>(CLAVES_NO_EDITABLES);

export function ConfiguracionTable({ categoriaInicial = 'ALERTAS' }: { categoriaInicial?: string }) {
  const [categoria, setCategoria] = useState<string>(categoriaInicial);
  const { data, isLoading, error, refetch } = useConfiguracion(categoria || undefined);
  const mutacion = useActualizarConfiguracion();
  const [editando, setEditando] = useState<ConfiguracionItem | null>(null);
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [conflicto, setConflicto] = useState<{ clave: string; valor_actual: string | null; version_actual: number } | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const abrir = (item: ConfiguracionItem) => {
    setEditando(item);
    setValor(item.valor ?? '');
    setMotivo('');
    setErrorGuardar(null);
    setExito(null);
    setConflicto(null);
  };

  const guardar = async () => {
    if (!editando) return;
    let valorEnviar: string | number | boolean | null = valor;
    if (editando.tipo === 'INT') valorEnviar = valor.trim() === '' ? null : Number(valor);
    if (editando.tipo === 'BOOL') valorEnviar = valor === 'true';
    if (editando.tipo === 'DATE' && valor.trim() === '') valorEnviar = null;
    try {
      await mutacion.mutateAsync({ clave: editando.clave, valor: valorEnviar, version: editando.version, motivo: motivo.trim() || undefined });
      setExito(`La clave ${editando.clave} se actualizo correctamente.`);
      setEditando(null);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        const d = (e.details ?? {}) as { valor_actual?: string | null; version_actual?: number };
        setConflicto({ clave: editando.clave, valor_actual: d.valor_actual ?? null, version_actual: d.version_actual ?? -1 });
        setEditando(null);
        return;
      }
      setErrorGuardar(mensajeDeError(e, 'No fue posible guardar el cambio.'));
    }
  };

  const control = (item: ConfiguracionItem) => {
    if (item.tipo === 'BOOL') {
      return <Select opciones={[{ valor: 'true', etiqueta: 'Si (true)' }, { valor: 'false', etiqueta: 'No (false)' }]} value={valor} onChange={(e) => setValor(e.target.value)} />;
    }
    if (item.tipo === 'TEXT' || item.tipo === 'JSON') return <Textarea value={valor} onChange={(e) => setValor(e.target.value)} />;
    if (item.tipo === 'DATE') return <Input type="date" value={valor} onChange={(e) => setValor(e.target.value)} />;
    if (item.tipo === 'INT') return <Input type="number" inputMode="numeric" min={item.valor_min ?? undefined} max={item.valor_max ?? undefined} value={valor} onChange={(e) => setValor(e.target.value)} />;
    return <Input value={valor} onChange={(e) => setValor(e.target.value)} />;
  };

  return (
    <>
      <Card
        titulo="Parametros del sistema"
        acciones={
          <label className="text-sm">
            <span className="sr-only">Categoria</span>
            <Select
              opciones={CATEGORIAS_CONFIGURACION.map((c) => ({ valor: c, etiqueta: ETIQUETA_CATEGORIA[c] ?? c }))}
              placeholder="Todas las categorias"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="min-w-[14rem]"
            />
          </label>
        }
        pie="Las claves de las categorias Juridico, Seguridad y Documentos exigen confirmacion explicita. Los cambios no se aplican a plazos ya fijados ni invalidan documentos ya cargados."
      >
        {error && <Alert tipo="error" className="mb-3">{(error as Error).message}</Alert>}
        {exito && <Alert tipo="exito" className="mb-3">{exito}</Alert>}
        {conflicto && (
          <Alert tipo="advertencia" titulo="Version desactualizada" className="mb-3">
            <p>
              La clave <span className="font-mono">{conflicto.clave}</span> fue modificada por otro usuario mientras usted la editaba. Valor vigente:{' '}
              <span className="font-mono">{conflicto.valor_actual ?? '(vacio)'}</span> (version {conflicto.version_actual}). Recargue los valores y vuelva a intentarlo.
            </p>
            <Button
              variante="secundario"
              className="mt-2 min-h-[36px] px-3 py-1 text-sm"
              onClick={() => {
                setConflicto(null);
                void refetch();
              }}
            >
              Recargar valores
            </Button>
          </Alert>
        )}
        <Table<ConfiguracionItem>
          caption="Claves de configuracion"
          columnas={[
            {
              clave: 'clave',
              titulo: 'Clave',
              render: (c) => (
                <div>
                  <span className="font-mono text-xs font-semibold">{c.clave}</span>
                  <p className="text-xs text-ink/70">{c.descripcion}</p>
                  {c.pendiente_confirmar && <Badge tono="destacado" className="mt-1">Por confirmar</Badge>}
                </div>
              ),
            },
            { clave: 'categoria', titulo: 'Categoria', render: (c) => ETIQUETA_CATEGORIA[c.categoria] ?? c.categoria },
            { clave: 'valor', titulo: 'Valor', render: (c) => <span className="font-mono text-sm break-words">{c.valor ?? '(vacio)'}</span> },
            {
              clave: 'rango',
              titulo: 'Tipo / rango',
              render: (c) => (
                <span className="text-xs">
                  {c.tipo}
                  {c.valor_min !== null || c.valor_max !== null ? ` (${c.valor_min ?? '—'} a ${c.valor_max ?? '—'})` : ''}
                </span>
              ),
            },
            { clave: 'version', titulo: 'Version', alineacion: 'derecha', render: (c) => <span className="tabular-nums">{c.version}</span> },
            { clave: 'actualizado', titulo: 'Actualizado', render: (c) => fechaHora(c.actualizado_en) },
            {
              clave: 'editar',
              titulo: 'Accion',
              render: (c) =>
                NO_EDITABLES.has(c.clave) ? (
                  <span className="text-xs text-ink/70">Se cambia publicando una version</span>
                ) : (
                  <Button variante="secundario" className="min-h-[32px] px-2 py-0 text-sm" onClick={() => abrir(c)}>
                    Editar
                  </Button>
                ),
            },
          ]}
          filas={data?.data ?? []}
          obtenerId={(c) => c.clave}
          cargando={isLoading}
          vacio={{ titulo: 'Sin claves', descripcion: 'No hay parametros en esta categoria.' }}
        />
      </Card>
      <Modal
        abierto={editando !== null}
        titulo={editando ? `Modificar ${editando.clave}` : ''}
        onCerrar={() => setEditando(null)}
        onConfirmar={guardar}
        textoConfirmar="Guardar cambio"
        cargando={mutacion.isPending}
        confirmacion={{ palabra: 'CONFIRMAR', comprension: 'Entiendo que este cambio afecta el comportamiento de la plataforma y queda registrado en la auditoria.' }}
      >
        {editando && (
          <>
            <p className="mb-3 text-sm">{editando.descripcion}</p>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block font-semibold">
                Nuevo valor ({editando.tipo}
                {editando.valor_min !== null || editando.valor_max !== null ? `, entre ${editando.valor_min ?? '—'} y ${editando.valor_max ?? '—'}` : ''})
              </span>
              {control(editando)}
            </label>
            <label className="mb-1 block text-sm">
              <span className="mb-1 block font-semibold">Motivo (opcional)</span>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            <p className="text-xs text-ink/70">
              Valor actual: <span className="font-mono">{editando.valor ?? '(vacio)'}</span> · version {editando.version}
            </p>
            {errorGuardar && <Alert tipo="error" className="mt-3">{errorGuardar}</Alert>}
          </>
        )}
      </Modal>
    </>
  );
}
