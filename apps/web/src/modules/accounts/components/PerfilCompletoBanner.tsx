import { CAMPO_PERFIL_ETIQUETA } from '@foest/shared';
import { Alert } from '../../../components/ui';

/** Indicador de `perfil_completo` con la lista de campos faltantes en lenguaje claro. */
export function PerfilCompletoBanner({ completo, faltantes }: { completo: boolean; faltantes: string[] }) {
  if (completo) {
    return (
      <Alert tipo="exito" titulo="Perfil completo" data-testid="perfil-completo">
        Su informacion personal esta completa. Ya puede presentar postulaciones en las convocatorias abiertas.
      </Alert>
    );
  }
  return (
    <Alert tipo="advertencia" titulo="Perfil incompleto" data-testid="perfil-incompleto">
      <p>Para poder enviar una postulacion debe completar la siguiente informacion:</p>
      <ul className="mt-2 list-disc pl-6">
        {faltantes.map((c) => (
          <li key={c}>{CAMPO_PERFIL_ETIQUETA[c] ?? c}</li>
        ))}
      </ul>
    </Alert>
  );
}
