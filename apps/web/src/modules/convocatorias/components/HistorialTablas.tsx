import { Table } from '../../../components/ui';
import type { Ampliacion, CambioEstado } from '../types';
import { ETIQUETA_ESTADO, ETIQUETA_ORIGEN, ETIQUETA_TIPO_AMPLIACION, fechaCierreDesdeExclusiva, formatearFechaHora, formatearFechaLocal } from '../utils';

export function AmpliacionesTable({ ampliaciones }: { ampliaciones: Ampliacion[] }) {
  return (
    <Table<Ampliacion>
      caption="Ampliaciones y reaperturas"
      columnas={[
        { clave: 'fecha', titulo: 'Registrada', render: (a) => formatearFechaHora(a.fecha_ampliacion) },
        { clave: 'tipo', titulo: 'Tipo', render: (a) => ETIQUETA_TIPO_AMPLIACION[a.tipo] },
        { clave: 'anterior', titulo: 'Cierre anterior', render: (a) => formatearFechaLocal(fechaCierreDesdeExclusiva(a.fecha_cierre_anterior)) },
        { clave: 'nueva', titulo: 'Cierre nuevo', render: (a) => formatearFechaLocal(fechaCierreDesdeExclusiva(a.fecha_cierre_nueva)) },
        { clave: 'estado', titulo: 'Estado anterior', render: (a) => ETIQUETA_ESTADO[a.estado_anterior] },
        { clave: 'motivo', titulo: 'Motivo', render: (a) => <span className="whitespace-pre-wrap">{a.motivo}</span> },
      ]}
      filas={ampliaciones}
      obtenerId={(a) => a.id}
      vacio={{ titulo: 'Sin ampliaciones', descripcion: 'La convocatoria no ha tenido prorrogas ni reaperturas.' }}
    />
  );
}

export function HistorialEstadosTable({ cambios }: { cambios: CambioEstado[] }) {
  return (
    <Table<CambioEstado>
      caption="Historial de estados"
      columnas={[
        { clave: 'fecha', titulo: 'Fecha', render: (c) => formatearFechaHora(c.registrado_en) },
        { clave: 'desde', titulo: 'Desde', render: (c) => (c.estado_desde ? ETIQUETA_ESTADO[c.estado_desde] : 'Creacion') },
        { clave: 'hasta', titulo: 'Hasta', render: (c) => ETIQUETA_ESTADO[c.estado_hasta] },
        { clave: 'origen', titulo: 'Origen', render: (c) => ETIQUETA_ORIGEN[c.origen] },
      ]}
      filas={cambios}
      obtenerId={(c) => c.id}
      vacio={{ titulo: 'Sin historial', descripcion: 'Aun no se registran cambios de estado.' }}
    />
  );
}
