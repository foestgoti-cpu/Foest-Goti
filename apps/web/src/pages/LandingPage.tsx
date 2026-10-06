import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

/**
 * Landing publica. Placeholder: el modulo `convocatorias` reemplazara el bloque
 * de convocatorias abiertas consumiendo `GET /api/v1/publico/convocatorias`.
 */
export function LandingPage() {
  return (
    <div className="space-y-8">
      <section className="border border-ink bg-primary-10 px-6 py-8">
        <h1 className="text-3xl">Fondo para la Educacion Superior de Tocancipa</h1>
        <p className="mt-3 max-w-3xl text-base">
          Plataforma oficial para la postulacion, evaluacion y seguimiento de los apoyos educativos del FOEST, en el marco del
          Acuerdo Municipal 023 de 2025.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/registro" className="no-underline hover:no-underline">
            <Button>Crear cuenta</Button>
          </Link>
          <Link to="/login" className="no-underline hover:no-underline">
            <Button variante="secundario">Iniciar sesion</Button>
          </Link>
        </div>
      </section>

      <Card titulo="Convocatorias abiertas">
        <EmptyState
          titulo="No hay convocatorias abiertas en este momento"
          descripcion="Cuando el FOEST habilite una convocatoria, aparecera en esta seccion con sus beneficios y fechas de cierre."
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card titulo="Beneficiarios">
          <p className="text-sm">Estudiantes de Tocancipa que presentan su solicitud, cargan soportes y siguen el estado de su expediente.</p>
        </Card>
        <Card titulo="Funcionarios">
          <p className="text-sm">Comite evaluador que revisa expedientes asignados y emite dictamen por beneficio.</p>
        </Card>
        <Card titulo="Administracion">
          <p className="text-sm">Gestion de convocatorias, cuentas, configuracion, auditoria y reportes del fondo.</p>
        </Card>
      </div>
    </div>
  );
}
