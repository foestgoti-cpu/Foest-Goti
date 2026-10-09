import { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Input, Select, Spinner } from '../../../components/ui';
import { useFuncionarios } from '../hooks/useConvocatorias';
import type { ExpedienteAfectado, MiembroComite } from '../types';
import { codigoDeError, detallesDeError, mensajeDeError } from '../utils';

export interface ComiteSelectorProps {
  comiteActual: MiembroComite[];
  guardando: boolean;
  errorGuardar: unknown;
  soloLectura?: boolean;
  onGuardar: (datos: { funcionario_ids: string[]; asignaciones?: 'LIBERAR' | 'MANTENER' }) => void;
}

/**
 * Selector multiple de funcionarios (consume `GET /api/v1/funcionarios` del modulo accounts).
 * Si la API responde 409 ASIGNACIONES_PENDIENTES, muestra los expedientes afectados y pide
 * decidir `asignaciones: LIBERAR | MANTENER` (DECISIONES section 18).
 */
export function ComiteSelector({ comiteActual, guardando, errorGuardar, soloLectura = false, onGuardar }: ComiteSelectorProps) {
  const { data, isLoading, error } = useFuncionarios(!soloLectura);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(comiteActual.map((m) => m.funcionario_id)));
  const [filtro, setFiltro] = useState('');
  const [decision, setDecision] = useState<'' | 'LIBERAR' | 'MANTENER'>('');

  const funcionarios = useMemo(() => {
    const lista = (data?.data ?? []).map((f) => ({
      id: f.usuario_id ?? f.id,
      email: f.email,
      nombre: `${f.nombres ?? ''} ${f.apellidos ?? ''}`.trim() || f.email,
      cargo: f.cargo ?? '',
      activo: f.activo,
    }));
    // Incluye miembros actuales que no aparezcan en el listado (p. ej. inactivos).
    for (const m of comiteActual) {
      if (!lista.some((f) => f.id === m.funcionario_id)) {
        lista.push({ id: m.funcionario_id, email: m.email, nombre: `${m.nombres ?? ''} ${m.apellidos ?? ''}`.trim() || m.email, cargo: m.cargo ?? '', activo: m.activo });
      }
    }
    const q = filtro.trim().toLowerCase();
    return lista
      .filter((f) => !q || f.nombre.toLowerCase().includes(q) || f.email.toLowerCase().includes(q) || f.cargo.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [data, comiteActual, filtro]);

  const pendientes = codigoDeError(errorGuardar) === 'ASIGNACIONES_PENDIENTES';
  const afectados = pendientes ? ((detallesDeError(errorGuardar) as { expedientes_afectados?: ExpedienteAfectado[] })?.expedientes_afectados ?? []) : [];

  const alternar = (id: string, marcado: boolean) => {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (marcado) copia.add(id);
      else copia.delete(id);
      return copia;
    });
  };

  const guardar = () => {
    onGuardar({ funcionario_ids: [...seleccion], ...(pendientes && decision ? { asignaciones: decision } : {}) });
  };

  const actuales = new Set(comiteActual.map((m) => m.funcionario_id));
  const retirados = [...actuales].filter((id) => !seleccion.has(id));
  const agregados = [...seleccion].filter((id) => !actuales.has(id));

  return (
    <div>
      <p className="mb-3 text-sm text-ink/80">
        Los funcionarios del comite ven el conjunto de postulaciones pendientes de esta convocatoria y pueden tomar expedientes para evaluacion. Solo se admiten
        funcionarios activos.
      </p>
      {errorGuardar && !pendientes ? (
        <Alert tipo="error" className="mb-4">
          {mensajeDeError(errorGuardar)}
        </Alert>
      ) : null}
      {pendientes && (
        <Alert tipo="advertencia" titulo="Expedientes en evaluacion" className="mb-4">
          <p>Uno o mas funcionarios retirados tienen expedientes en evaluacion. Indique que hacer con esas asignaciones antes de guardar:</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {afectados.map((a) => (
              <li key={a.funcionario_id}>
                Funcionario {a.funcionario_id}: {a.postulacion_ids.length} expediente(s)
              </li>
            ))}
          </ul>
          <div className="mt-3 max-w-md">
            <Select
              aria-label="Decision sobre las asignaciones"
              placeholder="Seleccione una opcion"
              opciones={[
                { valor: 'LIBERAR', etiqueta: 'Liberar las asignaciones (vuelven al conjunto pendiente)' },
                { valor: 'MANTENER', etiqueta: 'Mantener las asignaciones (quedan fuera de comite)' },
              ]}
              value={decision}
              onChange={(e) => setDecision(e.target.value as '' | 'LIBERAR' | 'MANTENER')}
            />
          </div>
        </Alert>
      )}
      {isLoading && <Spinner etiqueta="Cargando funcionarios" />}
      {error && (
        <Alert tipo="error" className="mb-4">
          No fue posible cargar el listado de funcionarios ({mensajeDeError(error)}). Verifique que el modulo de cuentas este disponible.
        </Alert>
      )}
      {!soloLectura && (
        <div className="mb-3 max-w-md">
          <Input aria-label="Buscar funcionario" placeholder="Buscar por nombre, correo o cargo" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
      )}
      <div className="border border-ink rounded-xl overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-primary-10">
            <tr>
              {!soloLectura && (
                <th scope="col" className="border-b border-ink px-3 py-2 text-left">
                  Miembro
                </th>
              )}
              <th scope="col" className="border-b border-ink px-3 py-2 text-left">
                Funcionario
              </th>
              <th scope="col" className="border-b border-ink px-3 py-2 text-left">
                Correo
              </th>
              <th scope="col" className="border-b border-ink px-3 py-2 text-left">
                Cargo
              </th>
              <th scope="col" className="border-b border-ink px-3 py-2 text-left">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {(soloLectura ? funcionarios.filter((f) => actuales.has(f.id)) : funcionarios).map((f) => (
              <tr key={f.id} className="border-b border-ink/30 last:border-b-0">
                {!soloLectura && (
                  <td className="px-3 py-2">
                    <Checkbox
                      etiqueta={<span className="sr-only">Incluir a {f.nombre}</span>}
                      aria-label={`Incluir a ${f.nombre}`}
                      checked={seleccion.has(f.id)}
                      disabled={!f.activo && !seleccion.has(f.id)}
                      onChange={(e) => alternar(f.id, e.target.checked)}
                    />
                  </td>
                )}
                <td className="px-3 py-2">{f.nombre}</td>
                <td className="px-3 py-2">{f.email}</td>
                <td className="px-3 py-2">{f.cargo || '-'}</td>
                <td className="px-3 py-2">{f.activo ? 'Activo' : 'Inactivo'}</td>
              </tr>
            ))}
            {funcionarios.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center">
                  No hay funcionarios para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!soloLectura && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            Seleccionados: {seleccion.size}. {agregados.length > 0 && `Se agregaran ${agregados.length}.`} {retirados.length > 0 && `Se retiraran ${retirados.length}.`}
          </p>
          <Button onClick={guardar} cargando={guardando} disabled={pendientes && !decision}>
            Guardar comite
          </Button>
        </div>
      )}
    </div>
  );
}
