export function Footer() {
  const anio = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-ink bg-primary-10">
      <div className="mx-auto max-w-content px-gutter py-4 text-xs leading-5 text-ink">
        <p className="font-semibold">Alcaldia Municipal de Tocancipa - Fondo para la Educacion Superior (FOEST)</p>
        <p>
          Acuerdo Municipal 023 de 2025. Los datos personales se tratan conforme a la Ley 1581 de 2012 (Habeas Data) y a la politica
          de tratamiento de datos de la Alcaldia de Tocancipa. Este sitio es de uso exclusivo para los tramites del FOEST.
        </p>
        <p className="mt-1">&copy; {anio} Alcaldia de Tocancipa. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
