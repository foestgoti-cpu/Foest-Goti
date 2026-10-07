import { useEffect, useState } from 'react';
import { Alert, FormField, Input, Modal, Textarea } from '../../../components/ui';
import { hoyBogota, mensajeError } from '../formato';
import { ActividadInputSchema, LABOR_SOCIAL_DESCRIPCION_MAX, LABOR_SOCIAL_DESCRIPCION_MIN, type ActividadDto, type ActividadInput } from '../types';

interface Borrador {
  fecha_actividad: string;
  horas_ejecutadas: string;
  descripcion_actividad: string;
  dependencia_municipal: string;
  nombre_supervisor: string;
  cargo_supervisor: string;
}

const VACIO: Borrador = {
  fecha_actividad: '',
  horas_ejecutadas: '',
  descripcion_actividad: '',
  dependencia_municipal: '',
  nombre_supervisor: '',
  cargo_supervisor: '',
};

function desdeActividad(a: ActividadDto | null): Borrador {
  if (!a) return VACIO;
  return {
    fecha_actividad: a.fecha_actividad,
    horas_ejecutadas: String(a.horas_ejecutadas).replace('.', ','),
    descripcion_actividad: a.descripcion_actividad,
    dependencia_municipal: a.dependencia_municipal,
    nombre_supervisor: a.nombre_supervisor,
    cargo_supervisor: a.cargo_supervisor,
  };
}

export interface LaborSocialFormModalProps {
  abierto: boolean;
  /** Actividad a editar; `null` para registrar una nueva. */
  actividad: ActividadDto | null;
  maxHorasDia: number;
  onCerrar: () => void;
  onGuardar: (datos: ActividadInput) => Promise<void>;
}

/** Alta y edición de una actividad de labor social. */
export function LaborSocialFormModal({ abierto, actividad, maxHorasDia, onCerrar, onGuardar }: LaborSocialFormModalProps) {
  const [v, setV] = useState<Borrador>(VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setV(desdeActividad(actividad));
      setErrores({});
      setErrorGeneral(null);
    }
  }, [abierto, actividad]);

  const set = (campo: keyof Borrador) => (e: { target: { value: string } }) => setV((prev) => ({ ...prev, [campo]: e.target.value }));

  const guardar = async () => {
    setErrorGeneral(null);
    const numero = v.horas_ejecutadas.trim() === '' ? Number.NaN : Number(v.horas_ejecutadas.trim().replace(',', '.'));
    const parsed = ActividadInputSchema.safeParse({ ...v, horas_ejecutadas: numero });
    if (!parsed.success) {
      const mapa: Record<string, string> = {};
      for (const issue of parsed.error.issues) mapa[issue.path.join('.')] ??= issue.message;
      setErrores(mapa);
      return;
    }
    setErrores({});
    setGuardando(true);
    try {
      await onGuardar(parsed.data);
      onCerrar();
    } catch (e) {
      setErrorGeneral(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo={actividad ? 'Editar actividad de labor social' : 'Registrar actividad de labor social'}
      onCerrar={onCerrar}
      onConfirmar={guardar}
      textoConfirmar="Guardar actividad"
      cargando={guardando}
    >
      {errorGeneral && (
        <Alert tipo="error" className="mb-4">
          {errorGeneral}
        </Alert>
      )}
      <FormField etiqueta="Fecha de la actividad" nombre="fecha_actividad" error={errores.fecha_actividad} obligatorio>
        <Input type="date" max={hoyBogota()} value={v.fecha_actividad} onChange={set('fecha_actividad')} />
      </FormField>
      <FormField
        etiqueta="Horas ejecutadas"
        nombre="horas_ejecutadas"
        error={errores.horas_ejecutadas}
        ayuda={`Hasta dos decimales (por ejemplo 2,5). Máximo ${maxHorasDia} horas por día sumando todas las actividades de la fecha.`}
        obligatorio
      >
        <Input inputMode="decimal" value={v.horas_ejecutadas} onChange={set('horas_ejecutadas')} />
      </FormField>
      <FormField
        etiqueta="Descripción de la actividad"
        nombre="descripcion_actividad"
        error={errores.descripcion_actividad}
        ayuda={`Entre ${LABOR_SOCIAL_DESCRIPCION_MIN} y ${LABOR_SOCIAL_DESCRIPCION_MAX} caracteres.`}
        obligatorio
      >
        <Textarea rows={3} maxLength={LABOR_SOCIAL_DESCRIPCION_MAX} value={v.descripcion_actividad} onChange={set('descripcion_actividad')} />
      </FormField>
      <FormField etiqueta="Dependencia municipal" nombre="dependencia_municipal" error={errores.dependencia_municipal} obligatorio>
        <Input value={v.dependencia_municipal} onChange={set('dependencia_municipal')} />
      </FormField>
      <FormField etiqueta="Nombre del supervisor" nombre="nombre_supervisor" error={errores.nombre_supervisor} obligatorio>
        <Input value={v.nombre_supervisor} onChange={set('nombre_supervisor')} />
      </FormField>
      <FormField etiqueta="Cargo del supervisor" nombre="cargo_supervisor" error={errores.cargo_supervisor} obligatorio>
        <Input value={v.cargo_supervisor} onChange={set('cargo_supervisor')} />
      </FormField>
    </Modal>
  );
}
