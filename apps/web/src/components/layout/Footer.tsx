import { Link } from 'react-router-dom';

/** Pie institucional de ancho completo (azul) con la leyenda legal del FOEST. */
export function Footer() {
  const anio = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-primary text-white">
      <div className="mx-auto grid max-w-content gap-6 px-gutter py-8 text-sm leading-6 md:grid-cols-3">
        <div>
          <p className="text-base font-semibold">FOEST</p>
          <p>Fondo para la Educación Superior</p>
          <p>Alcaldía Municipal de Tocancipá</p>
        </div>
        <div>
          <p className="font-semibold">Marco normativo</p>
          <p>Acuerdo Municipal 023 de 2025.</p>
          <p>Este sitio es de uso exclusivo para los trámites del FOEST.</p>
        </div>
        <div>
          <p className="font-semibold">Tratamiento de datos</p>
          <p>
            Los datos personales se tratan conforme a la Ley 1581 de 2012 (Habeas Data) y a la política de tratamiento de datos de la
            Alcaldía de Tocancipá.
          </p>
          <p className="mt-2">
            <Link to="/convocatorias" className="text-white underline hover:text-white">
              Convocatorias abiertas
            </Link>
          </p>
        </div>
      </div>
      <div className="border-t border-white/30">
        <p className="mx-auto max-w-content px-gutter py-3 text-xs">&copy; {anio} Alcaldía de Tocancipá. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
