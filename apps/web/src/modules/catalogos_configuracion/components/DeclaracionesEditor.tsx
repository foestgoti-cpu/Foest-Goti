import { useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, Input, Modal, Table, Textarea } from '../../../components/ui';
import {
  useConsentimientoVigente,
  useDeclaracionesTodas,
  usePublicarConsentimiento,
  usePublicarDeclaracion,
  useVersionesConsentimiento,
} from '../hooks/useDeclaraciones';
import { CODIGOS_DECLARACION, type DeclaracionJuramentada, type TextoConsentimiento } from '../types';
import { fecha, fechaHora, mensajeDeError } from './formato';

/**
 * Versionado de las seis declaraciones juramentadas (GE-F041) y del texto de
 * consentimiento (Ley 1581). Publicar crea una version nueva e inmutable; la
 * anterior queda inactiva. Doble intencion en cada publicacion.
 */
export function DeclaracionesEditor() {
  const todas = useDeclaracionesTodas();
  const publicar = usePublicarDeclaracion();
  const vigenteCons = useConsentimientoVigente();
  const versionesCons = useVersionesConsentimiento();
  const publicarCons = usePublicarConsentimiento();

  const [codigo, setCodigo] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [confirmado, setConfirmado] = useState(true);
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const [editandoCons, setEditandoCons] = useState(false);
  const [textoCons, setTextoCons] = useState('');
  const [motivoCons, setMotivoCons] = useState('');
  const [mensajeCons, setMensajeCons] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const declaraciones = todas.data?.data ?? [];
  const vigentes = CODIGOS_DECLARACION.map((c) => declaraciones.find((d) => d.codigo === c && d.vigente) ?? null);
  const sinConfirmar = vigentes.filter((d) => !d || !d.texto_oficial_confirmado).length;

  const abrir = (c: string) => {
    const actual = declaraciones.find((d) => d.codigo === c && d.vigente);
    setCodigo(c);
    setTitulo(actual?.titulo ?? `Declaracion juramentada ${c.slice(-1)}`);
    setTexto(actual && actual.texto_oficial_confirmado ? actual.texto : '');
    setConfirmado(true);
    setMotivo('');
    setMensaje(null);
  };

  const confirmarPublicar = async () => {
    if (!codigo) return;
    try {
      const d = await publicar.mutateAsync({ codigo, titulo: titulo.trim(), texto: texto.trim(), texto_oficial_confirmado: confirmado, motivo: motivo.trim() || undefined });
      setMensaje({ tipo: 'exito', texto: `Se publico la version ${d.version} de ${d.codigo}.` });
      setCodigo(null);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(e, 'No fue posible publicar la declaracion.') });
      setCodigo(null);
    }
  };

  const confirmarPublicarCons = async () => {
    try {
      const v = await publicarCons.mutateAsync({ texto: textoCons.trim(), motivo: motivoCons.trim() || undefined });
      setMensajeCons({ tipo: 'exito', texto: `Se publico la version ${v.version} del consentimiento; el registro la mostrara de inmediato.` });
      setEditandoCons(false);
    } catch (e) {
      setMensajeCons({ tipo: 'error', texto: mensajeDeError(e, 'No fue posible publicar el consentimiento.') });
      setEditandoCons(false);
    }
  };

  return (
    <>
      <Card
        titulo="Declaraciones juramentadas (GE-F041)"
        className="mb-4"
        pie="El envio de postulaciones en produccion se bloquea mientras alguna declaracion vigente no tenga el texto oficial confirmado."
      >
        {todas.error && <Alert tipo="error" className="mb-3">{(todas.error as Error).message}</Alert>}
        {mensaje && <Alert tipo={mensaje.tipo} className="mb-3">{mensaje.texto}</Alert>}
        {sinConfirmar > 0 && !todas.isLoading && (
          <Alert tipo="advertencia" titulo="Texto oficial pendiente" className="mb-3">
            {sinConfirmar} de 6 declaraciones vigentes usan un texto PROVISIONAL. Publique la version con el texto del formato GE-F041.
          </Alert>
        )}
        <Table<DeclaracionJuramentada>
          caption="Versiones de declaraciones juramentadas"
          columnas={[
            { clave: 'codigo', titulo: 'Codigo', render: (d) => <span className="font-mono text-xs">{d.codigo}</span> },
            { clave: 'version', titulo: 'Version', alineacion: 'derecha', render: (d) => d.version },
            {
              clave: 'estado',
              titulo: 'Estado',
              render: (d) => (
                <span className="flex flex-wrap gap-1">
                  {d.vigente ? <Badge tono="relleno">Vigente</Badge> : <Badge>Historica</Badge>}
                  {!d.texto_oficial_confirmado && <Badge tono="destacado">Provisional</Badge>}
                </span>
              ),
            },
            {
              clave: 'texto',
              titulo: 'Titulo y texto',
              render: (d) => (
                <div>
                  <p className="font-semibold">{d.titulo}</p>
                  <p className="text-xs text-ink/80">{d.texto.length > 220 ? `${d.texto.slice(0, 220)}...` : d.texto}</p>
                </div>
              ),
            },
            { clave: 'desde', titulo: 'Vigente desde', render: (d) => fecha(d.vigente_desde) },
            {
              clave: 'accion',
              titulo: 'Accion',
              render: (d) =>
                d.vigente ? (
                  <Button variante="secundario" className="min-h-[32px] px-2 py-0 text-sm" onClick={() => abrir(d.codigo)}>
                    Nueva version
                  </Button>
                ) : null,
            },
          ]}
          filas={declaraciones}
          obtenerId={(d) => d.id}
          cargando={todas.isLoading}
          vacio={{ titulo: 'Sin declaraciones', descripcion: 'La migracion base siembra DECL_1..DECL_6.' }}
        />
      </Card>

      <Card
        titulo="Consentimiento de tratamiento de datos (Ley 1581)"
        acciones={
          <Button
            variante="secundario"
            className="min-h-[36px] px-3 py-1 text-sm"
            onClick={() => {
              setTextoCons(vigenteCons.data?.texto ?? '');
              setMotivoCons('');
              setMensajeCons(null);
              setEditandoCons(true);
            }}
          >
            Publicar nueva version
          </Button>
        }
        pie="Publicar una version no invalida consentimientos previos; la politica de re-consentimiento esta por confirmar con juridica."
      >
        {mensajeCons && <Alert tipo={mensajeCons.tipo} className="mb-3">{mensajeCons.texto}</Alert>}
        {vigenteCons.data && (
          <div className="mb-4 border border-ink p-3 text-sm">
            <p className="mb-1 font-semibold">
              Version vigente: {vigenteCons.data.version}
              {vigenteCons.data.vigente_desde ? ` (desde ${fecha(vigenteCons.data.vigente_desde)})` : ''}
            </p>
            <p className="whitespace-pre-wrap">{vigenteCons.data.texto}</p>
          </div>
        )}
        {versionesCons.error && <Alert tipo="error" className="mb-3">{(versionesCons.error as Error).message}</Alert>}
        <Table<TextoConsentimiento>
          caption="Versiones del consentimiento"
          columnas={[
            { clave: 'version', titulo: 'Version', alineacion: 'derecha', render: (v) => v.version },
            { clave: 'estado', titulo: 'Estado', render: (v) => (v.vigente ? <Badge tono="relleno">Vigente</Badge> : <Badge>Historica</Badge>) },
            { clave: 'desde', titulo: 'Vigente desde', render: (v) => fecha(v.vigente_desde) },
            { clave: 'creado', titulo: 'Publicada', render: (v) => fechaHora(v.creado_en) },
            { clave: 'texto', titulo: 'Texto', render: (v) => <span className="text-xs">{v.texto.length > 160 ? `${v.texto.slice(0, 160)}...` : v.texto}</span> },
          ]}
          filas={versionesCons.data?.data ?? []}
          obtenerId={(v) => v.id}
          cargando={versionesCons.isLoading}
          vacio={{ titulo: 'Sin versiones en tabla', descripcion: 'Hasta aplicar la migracion 0010, el texto vigente se lee de configuracion_sistema.' }}
        />
      </Card>

      <Modal
        abierto={codigo !== null}
        titulo={codigo ? `Publicar nueva version de ${codigo}` : ''}
        onCerrar={() => setCodigo(null)}
        onConfirmar={confirmarPublicar}
        textoConfirmar="Publicar version"
        cargando={publicar.isPending}
        confirmacion={{ palabra: codigo ?? 'CONFIRMAR', comprension: 'Entiendo que la version anterior queda inactiva e inmutable y que la publicacion queda auditada.' }}
      >
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-semibold">Titulo</span>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} minLength={3} maxLength={200} />
        </label>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-semibold">Texto oficial (GE-F041)</span>
          <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <Checkbox etiqueta="El texto corresponde al formato oficial GE-F041 (texto_oficial_confirmado)" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-semibold">Motivo (opcional)</span>
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        {texto.trim().length < 20 && <p className="mt-2 text-xs text-ink/70">El texto debe tener al menos 20 caracteres.</p>}
      </Modal>

      <Modal
        abierto={editandoCons}
        titulo="Publicar nueva version del consentimiento"
        onCerrar={() => setEditandoCons(false)}
        onConfirmar={confirmarPublicarCons}
        textoConfirmar="Publicar version"
        cargando={publicarCons.isPending}
        confirmacion={{ palabra: 'PUBLICAR', comprension: 'Entiendo que el registro mostrara este texto de inmediato, que la version anterior queda inmutable y que la publicacion queda auditada.' }}
      >
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-semibold">Texto del consentimiento</span>
          <Textarea rows={10} value={textoCons} onChange={(e) => setTextoCons(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Motivo (opcional)</span>
          <Textarea rows={2} value={motivoCons} onChange={(e) => setMotivoCons(e.target.value)} />
        </label>
        {textoCons.trim().length < 50 && <p className="mt-2 text-xs text-ink/70">El texto debe tener al menos 50 caracteres.</p>}
      </Modal>
    </>
  );
}
