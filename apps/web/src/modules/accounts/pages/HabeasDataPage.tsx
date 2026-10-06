import { useEffect, useState } from 'react';
import { ResolverHabeasDataSchema, TIPO_SOLICITUD_HABEAS_ETIQUETA, type DecisionHabeas } from '@foest/shared';
import type { ZodError } from 'zod';
import { Alert, Badge, Button, FormField, Modal, PageHeader, Select, Table, Textarea } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { useBandejaHabeasData, useResolverHabeasData } from '../hooks/useBeneficiarios';
import type { SolicitudHabeasData } from '../types';

const ESTADO_TEXTO = { RADICADA: 'Radicada', RESUELTA: 'Resuelta', RECHAZADA: 'Rechazada' } as const;

export function HabeasDataPage() {
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState('');
  const [objetivo, setObjetivo] = useState<SolicitudHabeasData | null>(null);
  const [decision, setDecision] = useState<DecisionHabeas>('APROBAR');
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<ZodError | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const { data, isLoading, error } = useBandejaHabeasData(page, estado || undefined);
  const resolver = useResolverHabeasData();

  useEffect(() => {
    if (!objetivo) {
      setDecision('APROBAR');
      setMotivo('');
      setErrores(null);
      resolver.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objetivo]);

  const confirmar = async () => {
    if (!objetivo) return;
    const r = ResolverHabeasDataSchema.safeParse({ decision, motivo });
    if (!r.success) return setErrores(r.error);
    setErrores(null);
    try {
      await resolver.mutateAsync({ id: objetivo.id, dto: r.data });
      setMensaje(
        r.data.decision === 'APROBAR' && objetivo.tipo === 'SUPRESION'
          ? 'La solicitud fue aprobada: los datos del titular fueron anonimizados y la cuenta deshabilitada. Los soportes de actuaciones administrativas se conservan bajo retencion.'
          : 'La solicitud fue resuelta.',
      );
      setObjetivo(null);
    } catch {
      // se muestra en el modal
    }
  };

  const errorModal =
    resolver.error instanceof ApiRequestError
      ? resolver.error.code === 'SUPRESION_NO_PROCEDE'
        ? 'La supresion no procede: el titular tiene postulaciones en tramite. Rechace la solicitud indicando el motivo.'
        : resolver.error.message
      : null;

  return (
    <>
      <PageHeader titulo="Solicitudes de habeas data" descripcion="Derechos de acceso, rectificacion y supresion (Ley 1581 de 2012). La supresion aprobada anonimiza al titular de forma irreversible." />
      {mensaje && (
        <Alert tipo="exito" className="mb-4">
          {mensaje}
        </Alert>
      )}
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      <div className="mb-4 max-w-xs">
        <Select
          aria-label="Estado"
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value);
            setPage(1);
          }}
          placeholder="Todos los estados"
          opciones={[
            { valor: 'RADICADA', etiqueta: 'Radicadas' },
            { valor: 'RESUELTA', etiqueta: 'Resueltas' },
            { valor: 'RECHAZADA', etiqueta: 'Rechazadas' },
          ]}
        />
      </div>
      <Table<SolicitudHabeasData>
        caption="Bandeja de solicitudes de habeas data"
        columnas={[
          { clave: 'fecha', titulo: 'Radicada', render: (s) => new Date(s.creada_en).toLocaleString('es-CO') },
          { clave: 'titular', titulo: 'Titular', render: (s) => <span>{s.nombre ?? '(sin nombre)'}<br /><span className="text-sm">{s.email}</span></span> },
          { clave: 'tipo', titulo: 'Tipo', render: (s) => TIPO_SOLICITUD_HABEAS_ETIQUETA[s.tipo] },
          { clave: 'detalle', titulo: 'Detalle', render: (s) => <span className="block max-w-md whitespace-pre-wrap">{s.detalle}</span> },
          { clave: 'estado', titulo: 'Estado', render: (s) => <Badge tono={s.estado === 'RADICADA' ? 'destacado' : 'neutro'}>{ESTADO_TEXTO[s.estado]}</Badge> },
          {
            clave: 'acciones',
            titulo: 'Acciones',
            render: (s) =>
              s.estado === 'RADICADA' ? (
                <Button variante="texto" className="min-h-[36px] px-2 py-1 text-sm" onClick={() => setObjetivo(s)}>
                  Resolver
                </Button>
              ) : (
                <span className="text-sm">{s.motivo_resolucion}</span>
              ),
          },
        ]}
        filas={data?.data ?? []}
        obtenerId={(s) => s.id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin solicitudes' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: setPage } : undefined}
      />
      <Modal
        abierto={Boolean(objetivo)}
        titulo="Resolver solicitud"
        onCerrar={() => setObjetivo(null)}
        onConfirmar={confirmar}
        textoConfirmar="Resolver"
        cargando={resolver.isPending}
        confirmacion={
          objetivo?.tipo === 'SUPRESION' && decision === 'APROBAR'
            ? { palabra: 'ANONIMIZAR', comprension: 'Entiendo que la anonimizacion es irreversible: el titular perdera el acceso y sus datos personales seran eliminados.' }
            : undefined
        }
      >
        {objetivo && (
          <p className="mb-3">
            {TIPO_SOLICITUD_HABEAS_ETIQUETA[objetivo.tipo]} de {objetivo.email}.
            {objetivo.tipo === 'ACCESO' && ' El titular puede descargar sus datos desde su perfil; registre aqui la atencion de la solicitud.'}
            {objetivo.tipo === 'RECTIFICACION' && ' Si procede, corrija el documento desde el detalle del beneficiario antes de resolver.'}
          </p>
        )}
        {errorModal && (
          <Alert tipo="error" className="mb-3">
            {errorModal}
          </Alert>
        )}
        <FormField etiqueta="Decision" nombre="decision" error={errores} obligatorio>
          <Select
            value={decision}
            onChange={(e) => setDecision(e.target.value as DecisionHabeas)}
            opciones={[
              { valor: 'APROBAR', etiqueta: 'Aprobar' },
              { valor: 'RECHAZAR', etiqueta: 'Rechazar' },
            ]}
          />
        </FormField>
        <FormField etiqueta="Motivo de la resolucion" nombre="motivo" error={errores} obligatorio ayuda="Minimo 15 caracteres. Se comunica al titular.">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        </FormField>
      </Modal>
    </>
  );
}
