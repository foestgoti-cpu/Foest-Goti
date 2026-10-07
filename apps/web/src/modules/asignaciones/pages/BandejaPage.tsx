import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CODIGOS_BENEFICIO, TIPOS_SOLICITUD, type CodigoBeneficio, type ResumenBandejaDto, type TipoSolicitud, type VistaBandeja } from '@foest/shared';
import { Alert, Badge, Button, Card, FormField, Input, PageHeader, Select, Table } from '../../../components/ui';
import { usePermissions } from '../../roles_permissions';
import { fechaCorta, TEXTO_TIPO_SOLICITUD } from '../../postulaciones/formato';
import { AccionExpedienteModal, type AccionExpediente } from '../components/AccionExpedienteModal';
import { useBandeja } from '../hooks/useAsignaciones';
import type { FiltrosBandeja } from '../types';

interface Borrador {
  vista: VistaBandeja | '';
  tipo_solicitud: TipoSolicitud | '';
  beneficio: CodigoBeneficio | '';
  q: string;
}

/** Bandeja del funcionario: pool de su comite y expedientes propios (resumen minimo, sin datos personales). */
export function BandejaPage() {
  const { can } = usePermissions();
  const [borrador, setBorrador] = useState<Borrador>({ vista: '', tipo_solicitud: '', beneficio: '', q: '' });
  const [filtros, setFiltros] = useState<FiltrosBandeja>({ page: 1 });
  const [accion, setAccion] = useState<{ tipo: AccionExpediente; fila: ResumenBandejaDto } | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const { data, isLoading, error } = useBandeja(filtros);

  const aplicar = () =>
    setFiltros({
      page: 1,
      vista: borrador.vista || undefined,
      tipo_solicitud: borrador.tipo_solicitud || undefined,
      beneficio: borrador.beneficio || undefined,
    });

  const esMia = (f: ResumenBandejaDto) => f.asignacion?.estado === 'ACTIVA' && f.asignacion.titular === 'yo';

  return (
    <>
      <PageHeader
        titulo="Bandeja de expedientes"
        descripcion="Expedientes pendientes de las convocatorias de su comite y los que usted tiene a cargo. Los datos personales solo se muestran al abrir un expediente asignado a usted."
      />
      {exito && (
        <Alert tipo="exito" className="mb-4">
          {exito}
        </Alert>
      )}
      <Card titulo="Filtros" className="mb-4">
        <form
          className="grid grid-cols-1 gap-x-4 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            aplicar();
          }}
        >
          <FormField etiqueta="Estado de la asignacion" nombre="vista">
            <Select
              placeholder="Pool y mis expedientes"
              opciones={[
                { valor: 'POOL', etiqueta: 'Pool (sin asignar)' },
                { valor: 'MIS_ASIGNACIONES', etiqueta: 'Mis expedientes' },
              ]}
              value={borrador.vista}
              onChange={(e) => setBorrador({ ...borrador, vista: e.target.value as VistaBandeja | '' })}
            />
          </FormField>
          <FormField etiqueta="Tipo de tramite" nombre="tipo">
            <Select
              placeholder="Todos"
              opciones={TIPOS_SOLICITUD.map((t) => ({ valor: t, etiqueta: TEXTO_TIPO_SOLICITUD[t] ?? t }))}
              value={borrador.tipo_solicitud}
              onChange={(e) => setBorrador({ ...borrador, tipo_solicitud: e.target.value as TipoSolicitud | '' })}
            />
          </FormField>
          <FormField etiqueta="Beneficio" nombre="beneficio">
            <Select
              placeholder="Todos"
              opciones={CODIGOS_BENEFICIO.map((c) => ({ valor: c, etiqueta: c }))}
              value={borrador.beneficio}
              onChange={(e) => setBorrador({ ...borrador, beneficio: e.target.value as CodigoBeneficio | '' })}
            />
          </FormField>
          <FormField etiqueta="Codigo de expediente" nombre="q" ayuda="Filtra los resultados de la pagina actual.">
            <Input value={borrador.q} onChange={(e) => setBorrador({ ...borrador, q: e.target.value })} />
          </FormField>
          <div className="md:col-span-4">
            <Button type="submit">Aplicar filtros</Button>
          </div>
        </form>
      </Card>
      {error && (
        <Alert tipo="error" className="mb-4">
          {(error as Error).message}
        </Alert>
      )}
      <Table<ResumenBandejaDto>
        caption="Bandeja de expedientes"
        columnas={[
          { clave: 'codigo', titulo: 'Expediente', render: (f) => <span className="font-semibold">{f.codigo_expediente}</span> },
          { clave: 'conv', titulo: 'Convocatoria', render: (f) => f.convocatoria_nombre },
          { clave: 'tipo', titulo: 'Tramite', render: (f) => TEXTO_TIPO_SOLICITUD[f.tipo_solicitud] ?? f.tipo_solicitud },
          { clave: 'ben', titulo: 'Beneficios', render: (f) => f.beneficios_solicitados.join(', ') },
          { clave: 'ciclo', titulo: 'Ciclo', render: (f) => f.ciclo, alineacion: 'centro' },
          { clave: 'env', titulo: 'Enviada', render: (f) => fechaCorta(f.enviada_en) },
          { clave: 'dias', titulo: 'Dias habiles en espera', render: (f) => f.dias_habiles_en_espera, alineacion: 'centro' },
          {
            clave: 'estado',
            titulo: 'Asignacion',
            render: (f) =>
              esMia(f) ? (
                <Badge tono="relleno">Mio</Badge>
              ) : f.asignacion?.estado === 'ACTIVA' ? (
                <Badge tono="neutro">Asignado a otro</Badge>
              ) : f.asignacion ? (
                <Badge tono="neutro">Historico propio</Badge>
              ) : (
                <Badge tono="destacado">Pool</Badge>
              ),
          },
          {
            clave: 'acc',
            titulo: 'Acciones',
            render: (f) => (
              <span className="flex flex-wrap items-center gap-2">
                {esMia(f) ? (
                  <>
                    <Link to={`/funcionario/evaluacion/${f.postulacion_id}`}>Abrir expediente</Link>
                    {can('asignacion:liberar') && (
                      <Button variante="secundario" onClick={() => setAccion({ tipo: 'LIBERAR', fila: f })}>
                        Liberar
                      </Button>
                    )}
                    {can('asignacion:conflicto_interes') && (
                      <Button variante="secundario" onClick={() => setAccion({ tipo: 'CONFLICTO', fila: f })}>
                        Declarar conflicto de interes
                      </Button>
                    )}
                  </>
                ) : !f.asignacion ? (
                  <>
                    {can('asignacion:tomar') && <Button onClick={() => setAccion({ tipo: 'TOMAR', fila: f })}>Tomar expediente</Button>}
                    {can('asignacion:conflicto_interes') && (
                      <Button variante="secundario" onClick={() => setAccion({ tipo: 'CONFLICTO', fila: f })}>
                        Declarar conflicto de interes
                      </Button>
                    )}
                  </>
                ) : f.asignacion.estado === 'LIBERADA' ? (
                  <Link to={`/funcionario/evaluacion/${f.postulacion_id}`}>Consultar historico</Link>
                ) : null}
              </span>
            ),
          },
        ]}
        filas={(data?.data ?? []).filter((f) => f.codigo_expediente.toLowerCase().includes(borrador.q.trim().toLowerCase()))}
        obtenerId={(f) => f.postulacion_id}
        cargando={isLoading}
        vacio={{ titulo: 'Sin expedientes', descripcion: 'No hay expedientes para los filtros indicados.' }}
        paginacion={data ? { page: data.page, page_size: data.page_size, total: data.total, onCambiarPagina: (page) => setFiltros({ ...filtros, page }) } : undefined}
      />
      <AccionExpedienteModal accion={accion?.tipo ?? null} fila={accion?.fila ?? null} onCerrar={() => setAccion(null)} onExito={setExito} />
    </>
  );
}
