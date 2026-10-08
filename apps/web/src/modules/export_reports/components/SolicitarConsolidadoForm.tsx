import { useState } from 'react';
import {
  BENEFICIOS_CATALOGO,
  ESTADOS_POSTULACION,
  FORMATOS_CONSOLIDADO,
  TIPOS_SOLICITUD,
  type CodigoBeneficio,
  type EstadoPostulacion,
  type FiltrosConsolidado,
  type FormatoConsolidado,
  type TipoSolicitud,
} from '@foest/shared';
import { Alert, Button, Card, FormField, Input, Modal, Select } from '../../../components/ui';
import { useConvocatorias } from '../../convocatorias/hooks/useConvocatorias';
import { periodo } from '../../convocatorias/utils';
import { usePermissions } from '../../roles_permissions';
import { useSolicitarConsolidado } from '../hooks/useReportes';
import { mensajeReporte } from '../utils';

export const ADVERTENCIA_DATOS_PERSONALES =
  'El archivo puede contener datos personales de los postulantes. Su generacion y descarga quedan registradas en auditoria. Use la informacion unicamente para fines institucionales.';

const TEXTO_TIPO: Record<string, string> = { PRIMERA_VEZ: 'Primera vez', RENOVACION: 'Renovacion', REINTEGRO: 'Reintegro' };

export function construirFiltros(f: { estado: string; tipo_solicitud: string; beneficio: string; desde: string; hasta: string }): FiltrosConsolidado {
  const r: FiltrosConsolidado = {};
  if (f.estado) r.estado = f.estado as EstadoPostulacion;
  if (f.tipo_solicitud) r.tipo_solicitud = f.tipo_solicitud as TipoSolicitud;
  if (f.beneficio) r.beneficio = f.beneficio as CodigoBeneficio;
  if (f.desde) r.desde = f.desde;
  if (f.hasta) r.hasta = f.hasta;
  return r;
}

/** Formulario de solicitud de consolidado. La API limita las convocatorias segun el rol (comite para el funcionario). */
export function SolicitarConsolidadoForm({ onSolicitado }: { onSolicitado?: () => void }) {
  const { can } = usePermissions();
  const convocatorias = useConvocatorias({ page: 1, page_size: 100 });
  const solicitar = useSolicitarConsolidado();
  const [f, setF] = useState({ convocatoria_id: '', formato: 'HTML' as FormatoConsolidado, estado: '', tipo_solicitud: '', beneficio: '', desde: '', hasta: '' });
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const fechasInvalidas = Boolean(f.desde && f.hasta && f.desde > f.hasta);
  const puedeEnviar = Boolean(f.convocatoria_id) && !fechasInvalidas;

  const enviar = async () => {
    setMensaje(null);
    try {
      const r = await solicitar.mutateAsync({ convocatoriaId: f.convocatoria_id, formato: f.formato, filtros: construirFiltros(f) });
      setMensaje({
        tipo: 'exito',
        texto: r.sincrono
          ? 'El reporte esta listo. Puede descargarlo desde la tabla de sus reportes.'
          : 'Su solicitud quedo en cola. Le notificaremos cuando el reporte este listo.',
      });
      onSolicitado?.();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeReporte(e) });
    } finally {
      setConfirmar(false);
    }
  };

  if (!can('reportes:solicitar')) return <Alert tipo="info">Su rol no tiene permiso para solicitar reportes consolidados.</Alert>;

  return (
    <Card titulo="Solicitar consolidado por convocatoria" className="p-0">
      <div className="p-4">
        <Alert tipo="advertencia" className="mb-4">
          {ADVERTENCIA_DATOS_PERSONALES}{' '}
          {can('reportes:exportar_sensible')
            ? 'Su rol incluye columnas sensibles (estrato, SISBEN y documento).'
            : 'Las columnas sensibles (estrato, SISBEN y documento) no se incluiran con su rol.'}
        </Alert>
        {convocatorias.error && (
          <Alert tipo="error" className="mb-4">
            {mensajeReporte(convocatorias.error)}
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <FormField etiqueta="Convocatoria" nombre="convocatoria" obligatorio>
            <Select
              value={f.convocatoria_id}
              onChange={(e) => set('convocatoria_id', e.target.value)}
              placeholder={convocatorias.isLoading ? 'Cargando...' : 'Seleccione una convocatoria'}
              opciones={(convocatorias.data?.data ?? []).map((c) => ({ valor: c.id, etiqueta: `${periodo(c.anio, c.semestre)} - ${c.nombre}` }))}
            />
          </FormField>
          <FormField etiqueta="Formato" nombre="formato" obligatorio ayuda="El HTML se abre en el navegador y se puede imprimir o guardar como PDF; el CSV es para análisis en hojas de cálculo.">
            <Select value={f.formato} onChange={(e) => set('formato', e.target.value)} opciones={FORMATOS_CONSOLIDADO.map((x) => ({ valor: x, etiqueta: x }))} />
          </FormField>
          <FormField etiqueta="Estado de la postulacion" nombre="estado">
            <Select value={f.estado} onChange={(e) => set('estado', e.target.value)} placeholder="Todos" opciones={ESTADOS_POSTULACION.map((x) => ({ valor: x, etiqueta: x }))} />
          </FormField>
          <FormField etiqueta="Tipo de tramite" nombre="tipo_solicitud">
            <Select
              value={f.tipo_solicitud}
              onChange={(e) => set('tipo_solicitud', e.target.value)}
              placeholder="Todos"
              opciones={TIPOS_SOLICITUD.map((x) => ({ valor: x, etiqueta: TEXTO_TIPO[x] ?? x }))}
            />
          </FormField>
          <FormField etiqueta="Beneficio" nombre="beneficio">
            <Select
              value={f.beneficio}
              onChange={(e) => set('beneficio', e.target.value)}
              placeholder="Todos"
              opciones={BENEFICIOS_CATALOGO.map((b) => ({ valor: b.codigo, etiqueta: `${b.codigo} - ${b.nombre}` }))}
            />
          </FormField>
          <div />
          <FormField etiqueta="Enviadas desde" nombre="desde">
            <Input type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} />
          </FormField>
          <FormField etiqueta="Enviadas hasta" nombre="hasta" error={fechasInvalidas ? 'La fecha inicial no puede ser posterior a la final' : null}>
            <Input type="date" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} />
          </FormField>
        </div>
        {mensaje && (
          <Alert tipo={mensaje.tipo} className="mb-4">
            {mensaje.texto}
          </Alert>
        )}
        <Button disabled={!puedeEnviar} onClick={() => setConfirmar(true)}>
          Solicitar consolidado
        </Button>
      </div>
      <Modal
        abierto={confirmar}
        titulo="Confirmar exportacion"
        onCerrar={() => setConfirmar(false)}
        onConfirmar={enviar}
        textoConfirmar="Generar consolidado"
        cargando={solicitar.isPending}
        confirmacion={{ palabra: 'EXPORTAR', comprension: 'Entiendo que el archivo puede contener datos personales y que la exportacion queda auditada.' }}
      >
        <p>{ADVERTENCIA_DATOS_PERSONALES}</p>
      </Modal>
    </Card>
  );
}
