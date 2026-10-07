import { Button, Table, type Columna } from '../../../components/ui';
import { fechaDia, horas } from '../formato';
import type { ActividadDto } from '../types';

export interface TablaActividadesProps {
  actividades: ActividadDto[];
  /** Solo en EN_PROCESO se editan o eliminan. */
  editable: boolean;
  onEditar?: (a: ActividadDto) => void;
  onEliminar?: (a: ActividadDto) => void;
}

export function TablaActividades({ actividades, editable, onEditar, onEliminar }: TablaActividadesProps) {
  const columnas: Columna<ActividadDto>[] = [
    { clave: 'fecha', titulo: 'Fecha', render: (a) => fechaDia(a.fecha_actividad) },
    { clave: 'horas', titulo: 'Horas', alineacion: 'derecha', render: (a) => horas(a.horas_ejecutadas) },
    { clave: 'descripcion', titulo: 'Actividad', render: (a) => a.descripcion_actividad },
    { clave: 'dependencia', titulo: 'Dependencia', render: (a) => a.dependencia_municipal },
    {
      clave: 'supervisor',
      titulo: 'Supervisor',
      render: (a) => (
        <>
          {a.nombre_supervisor}
          <br />
          <span className="text-xs">{a.cargo_supervisor}</span>
        </>
      ),
    },
  ];
  if (editable) {
    columnas.push({
      clave: 'acciones',
      titulo: 'Acciones',
      render: (a) => (
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={() => onEditar?.(a)}>
            Editar
          </Button>
          <Button variante="secundario" className="min-h-[36px] px-3 py-1 text-sm" onClick={() => onEliminar?.(a)}>
            Eliminar
          </Button>
        </div>
      ),
    });
  }
  return (
    <Table
      caption="Actividades de labor social registradas"
      columnas={columnas}
      filas={actividades}
      obtenerId={(a) => a.id}
      vacio={{ titulo: 'Sin actividades registradas', descripcion: 'Agregue la primera actividad de labor social.' }}
    />
  );
}
