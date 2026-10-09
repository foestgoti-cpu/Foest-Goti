import { Link } from 'react-router-dom';
import { Badge, Button, Card } from '../../../components/ui';
import type { Resumen } from '../types';

/**
 * Tarjeta de bienvenida: convocatoria vigente (o fecha estimada de la proxima)
 * y boton destacado "Iniciar postulacion" o estado de la postulacion actual.
 */
export function EstudianteResumenCard({ resumen }: { resumen: Resumen }) {
  const { saludo, convocatoria_abierta: abierta, postulacion_actual: actual } = resumen;
  const saludoTexto = saludo.nombre ? `Bienvenido(a), ${saludo.nombre}` : 'Bienvenido(a) al portal del beneficiario';

  return (
    <Card titulo={saludoTexto} data-testid="resumen-card">
      {!saludo.perfil_completo && (
        <p className="mb-4 border border-ink rounded-lg px-3 py-2 text-sm">
          Su perfil esta incompleto. Para postularse debe completar sus datos en{' '}
          <Link to="/beneficiario/perfil" className="font-semibold">
            Mi perfil
          </Link>
          .
        </p>
      )}

      <section aria-labelledby="convocatoria-titulo" className="border border-ink rounded-xl overflow-hidden">
        <div className="border-b border-ink bg-primary-10 px-3 py-2">
          <h3 id="convocatoria-titulo" className="text-base font-semibold">
            {abierta ? 'Convocatoria vigente' : 'Convocatorias'}
          </h3>
        </div>
        <div className="px-3 py-3">
          {abierta ? (
            <>
              <p className="text-lg font-semibold">{abierta.nombre}</p>
              {abierta.descripcion && <p className="mt-1 text-sm text-ink/80">{abierta.descripcion}</p>}
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold">Cierre de inscripciones</dt>
                  <dd>{abierta.fecha_cierre_texto} (hora de Colombia)</dd>
                </div>
                <div>
                  <dt className="font-semibold">Tiempo restante</dt>
                  <dd>{abierta.dias_restantes <= 1 ? 'Cierra hoy' : `${abierta.dias_restantes} dias`}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <p className="text-base">{resumen.mensaje_convocatoria}</p>
              {resumen.proxima_apertura_texto && (
                <p className="mt-2 text-sm">
                  <span className="font-semibold">Proxima apertura estimada:</span> {resumen.proxima_apertura_texto}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <div className="mt-4">
        {resumen.puede_iniciar_postulacion && abierta ? (
          <>
            <p className="mb-2 text-sm">Usted aun no tiene una postulacion en esta convocatoria.</p>
            <Link to={`/beneficiario/postulaciones/nueva?convocatoria=${abierta.id}`} className="block no-underline hover:no-underline sm:inline-block">
              <Button bloque className="sm:w-auto sm:min-w-[260px]" disabled={!saludo.perfil_completo} tabIndex={-1}>
                Iniciar postulacion
              </Button>
            </Link>
            {!saludo.perfil_completo && <p className="mt-2 text-sm">Complete su perfil para habilitar el boton.</p>}
          </>
        ) : actual ? (
          <section aria-labelledby="postulacion-actual-titulo" className="border border-primary rounded-xl bg-primary-10 px-3 py-3">
            <h3 id="postulacion-actual-titulo" className="text-sm font-semibold uppercase tracking-wide">
              Su postulacion {actual.convocatoria ? `en ${actual.convocatoria.nombre}` : 'actual'}
            </h3>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold">
              <span>{actual.estado_texto}</span>
              <Badge tono={actual.requiere_accion ? 'relleno' : 'destacado'} aria-label={`Estado: ${actual.estado_texto}`}>
                {actual.requiere_accion ? 'Requiere su accion' : actual.terminal ? 'Finalizada' : 'En curso'}
              </Badge>
            </p>
            <p className="mt-1 text-sm">{actual.estado_descripcion}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Link to={`/beneficiario/postulaciones/${actual.id}`} className="no-underline hover:no-underline">
                <Button variante={actual.requiere_accion ? 'primario' : 'secundario'} bloque className="sm:w-auto" tabIndex={-1}>
                  {actual.estado === 'BORRADOR' ? 'Continuar borrador' : actual.estado === 'EN_CORRECCION' ? 'Corregir documentos' : 'Ver postulacion'}
                </Button>
              </Link>
              <a href="#expediente" className="inline-flex min-h-[44px] items-center justify-center border border-ink rounded-lg px-4 text-base no-underline hover:bg-primary-10 hover:no-underline">
                Ver linea de tiempo
              </a>
            </div>
          </section>
        ) : (
          <p className="text-sm text-ink/80">Cuando haya una convocatoria abierta podra iniciar su postulacion desde aqui.</p>
        )}
      </div>
    </Card>
  );
}
