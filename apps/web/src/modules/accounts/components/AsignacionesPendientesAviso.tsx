import { Alert } from '../../../components/ui';
import type { PendientesFuncionario } from '../types';

const ESTADO_TEXTO: Record<string, string> = {
  PENDIENTE: 'Pendiente de evaluacion',
  EN_EVALUACION: 'En evaluacion',
};

/**
 * Muestra el detalle del 409 ASIGNACIONES_PENDIENTES (regla REASSIGNMENT_REQUIRED):
 * la deshabilitacion no se completo porque el funcionario tiene expedientes en curso.
 */
export function AsignacionesPendientesAviso({ pendientes }: { pendientes: PendientesFuncionario }) {
  return (
    <Alert tipo="advertencia" titulo="Reasignacion requerida" data-testid="aviso-asignaciones-pendientes">
      <p>
        El funcionario tiene <strong>{pendientes.pendientes}</strong> expediente(s) pendiente(s) en{' '}
        <strong>{pendientes.asignaciones_activas}</strong> convocatoria(s) asignada(s). La cuenta no fue deshabilitada.
        Reasigne los expedientes desde el modulo de asignaciones o marque la opcion de forzar la deshabilitacion.
      </p>
      {pendientes.expedientes.length > 0 && (
        <table className="mt-3 w-full border-collapse border border-ink text-sm">
          <caption className="sr-only">Expedientes pendientes</caption>
          <thead className="bg-primary-10">
            <tr>
              <th scope="col" className="border-b border-ink px-2 py-1 text-left">Convocatoria</th>
              <th scope="col" className="border-b border-ink px-2 py-1 text-left">Expediente</th>
              <th scope="col" className="border-b border-ink px-2 py-1 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {pendientes.expedientes.map((e) => (
              <tr key={e.postulacion_id} className="border-b border-ink/30">
                <td className="px-2 py-1">{e.convocatoria_nombre ?? e.convocatoria_id}</td>
                <td className="px-2 py-1 font-mono">{e.postulacion_id.slice(0, 8)}</td>
                <td className="px-2 py-1">{ESTADO_TEXTO[e.estado] ?? e.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pendientes.pendientes > pendientes.expedientes.length && (
        <p className="mt-2 text-sm">Se muestran los primeros {pendientes.expedientes.length} de {pendientes.pendientes}.</p>
      )}
    </Alert>
  );
}
