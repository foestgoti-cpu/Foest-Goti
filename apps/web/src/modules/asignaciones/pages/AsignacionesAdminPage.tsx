import { useState } from 'react';
import type { AlertaAsignacionDto, EvaluadorCargaDto, ResultadoReasignacionMasivoDto } from '@foest/shared';
import { Alert, Button, Card, EmptyState, FormField, Input, PageHeader, Table } from '../../../components/ui';
import { usePermissions } from '../../roles_permissions';
import { AlertasSinMovimiento } from '../components/AlertasSinMovimiento';
import { HistorialAsignacion } from '../components/HistorialAsignacion';
import { ReasignacionMasivaModal } from '../components/ReasignacionMasivaModal';
import { ReasignarModal } from '../components/ReasignarModal';
import { useEvaluadores } from '../hooks/useAsignaciones';


type Pestana = 'evaluadores' | 'alertas' | 'reasignacion';

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: 'evaluadores', etiqueta: 'Asignaciones por evaluador' },
  { clave: 'alertas', etiqueta: 'Alertas' },
  { clave: 'reasignacion', etiqueta: 'Reasignacion' },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ResumenMasivo({ r }: { r: ResultadoReasignacionMasivoDto }) {
  return (
    <Alert tipo={r.omitidas.length > 0 ? 'advertencia' : 'exito'} titulo="Reasignacion masiva finalizada" className="mb-4">
      <p>
        Procesadas: {r.procesadas}. Reasignadas: {r.reasignadas}. Devueltas al pool: {r.devueltas_al_pool}. Omitidas: {r.omitidas.length}.
      </p>
      {r.omitidas.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {r.omitidas.map((o) => (
            <li key={o.postulacion_id}>
              {o.codigo_expediente}: {o.motivo}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

/** Panel administrativo: carga por evaluador, alertas de asignaciones sin movimiento y reasignacion. */
export function AsignacionesAdminPage() {
  const { can } = usePermissions();
  const puedeReasignar = can('asignacion:reasignar');
  const [pestana, setPestana] = useState<Pestana>('evaluadores');
  const [exito, setExito] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoReasignacionMasivoDto | null>(null);
  const [masiva, setMasiva] = useState<{ abierto: boolean; origen?: string }>({ abierto: false });
  const [individual, setIndividual] = useState<{ id: string; codigo?: string | null; titular?: string | null } | null>(null);
  const [idBusqueda, setIdBusqueda] = useState('');
  const [idConsulta, setIdConsulta] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const { data: evaluadores, isLoading, error } = useEvaluadores();

  const desdeAlerta = (a: AlertaAsignacionDto) => setIndividual({ id: a.postulacion_id, codigo: a.codigo_expediente, titular: a.funcionario_id });

  const buscar = () => {
    const v = idBusqueda.trim();
    if (!UUID.test(v)) {
      setErrorId('Ingrese el identificador completo del expediente (formato UUID). Puede copiarlo de la URL del detalle de la postulacion.');
      setIdConsulta(null);
      return;
    }
    setErrorId(null);
    setIdConsulta(v);
  };

  return (
    <>
      <PageHeader titulo="Asignaciones" descripcion="Carga de trabajo por evaluador, alertas de asignaciones sin movimiento y reasignacion de expedientes." />
      {exito && (
        <Alert tipo="exito" className="mb-4">
          {exito}
        </Alert>
      )}
      {resultado && <ResumenMasivo r={resultado} />}
      <div role="tablist" aria-label="Secciones de asignaciones" className="mb-4 flex flex-wrap gap-2">
        {PESTANAS.map((p) => (
          <Button
            key={p.clave}
            role="tab"
            aria-selected={pestana === p.clave}
            variante={pestana === p.clave ? 'primario' : 'secundario'}
            onClick={() => setPestana(p.clave)}
          >
            {p.etiqueta}
          </Button>
        ))}
      </div>

      {pestana === 'evaluadores' && (
        <>
          {error && (
            <Alert tipo="error" className="mb-4">
              {(error as Error).message}
            </Alert>
          )}
          <Table<EvaluadorCargaDto>
            caption="Asignaciones por evaluador"
            columnas={[
              { clave: 'nombre', titulo: 'Evaluador', render: (e) => e.nombre },
              { clave: 'activo', titulo: 'Cuenta', render: (e) => (!e.activo ? 'Inactiva' : 'Activa') },
              { clave: 'activas', titulo: 'Expedientes activos', render: (e) => e.asignaciones_activas, alineacion: 'centro' },
              {
                clave: 'acc',
                titulo: 'Acciones',
                render: (e) =>
                  puedeReasignar && (e.asignaciones_activas) > 0 ? (
                    <Button variante="secundario" onClick={() => setMasiva({ abierto: true, origen: e.funcionario_id })}>
                      Reasignar sus expedientes
                    </Button>
                  ) : null,
              },
            ]}
            filas={evaluadores ?? []}
            obtenerId={(e) => e.funcionario_id}
            cargando={isLoading}
            vacio={{ titulo: 'Sin evaluadores', descripcion: 'No hay funcionarios asignados a comites.' }}
          />
        </>
      )}

      {pestana === 'alertas' && <AlertasSinMovimiento onReasignar={desdeAlerta} />}

      {pestana === 'reasignacion' && (
        <div className="grid grid-cols-1 gap-4">
          <Card titulo="Reasignacion individual">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                buscar();
              }}
            >
              <FormField etiqueta="Identificador del expediente" nombre="id" error={errorId} ayuda="Consulte el historial de asignaciones y, desde alli, reasigne el expediente.">
                <Input value={idBusqueda} onChange={(e) => setIdBusqueda(e.target.value)} autoComplete="off" />
              </FormField>
              <Button type="submit" variante="secundario">
                Consultar historial
              </Button>
            </form>
            {idConsulta ? (
              <div className="mt-4">
                <h3 className="mb-3 text-base font-semibold">Historial de asignaciones</h3>
                <HistorialAsignacion postulacionId={idConsulta} />
                {puedeReasignar && (
                  <div className="mt-4">
                    <Button onClick={() => setIndividual({ id: idConsulta })}>Reasignar este expediente</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState titulo="Sin expediente seleccionado" descripcion="Ingrese un identificador para consultar su historial." />
              </div>
            )}
          </Card>
          <Card titulo="Reasignacion masiva">
            <p className="mb-4">
              Traslade todos los expedientes activos de un funcionario a otro evaluador o devuelvalos al pool. Use esta opcion cuando un funcionario sea deshabilitado.
            </p>
            {puedeReasignar ? (
              <Button onClick={() => setMasiva({ abierto: true })}>Iniciar reasignacion masiva</Button>
            ) : (
              <Alert tipo="info">Su rol no tiene permiso para reasignar expedientes.</Alert>
            )}
          </Card>
        </div>
      )}

      {individual && (
        <ReasignarModal
          abierto
          postulacionId={individual.id}
          codigoExpediente={individual.codigo}
          titularId={individual.titular}
          onCerrar={() => setIndividual(null)}
          onExito={setExito}
        />
      )}
      <ReasignacionMasivaModal
        abierto={masiva.abierto}
        origenInicial={masiva.origen}
        onCerrar={() => setMasiva({ abierto: false })}
        onResultado={(r) => {
          setResultado(r);
          setExito(null);
        }}
      />
    </>
  );
}
